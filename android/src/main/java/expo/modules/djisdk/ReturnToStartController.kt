package expo.modules.djisdk

import android.util.Log
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.sdk.keyvalue.value.common.LocationCoordinate2D
import dji.sdk.keyvalue.value.common.LocationCoordinate3D
import dji.sdk.keyvalue.value.flightcontroller.FlightCoordinateSystem
import dji.sdk.keyvalue.value.flightcontroller.RollPitchControlMode
import dji.sdk.keyvalue.value.flightcontroller.VerticalControlMode
import dji.sdk.keyvalue.value.flightcontroller.VirtualStickFlightControlParam
import dji.sdk.keyvalue.value.flightcontroller.YawControlMode
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.et.action
import dji.v5.et.create
import dji.v5.et.get
import dji.v5.manager.aircraft.virtualstick.VirtualStickManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Flies the aircraft back to where it took off and lands it with the pilot's
 * go-ahead:
 *
 *   RETURNING      straight line to DJI's home point, holding the altitude the
 *                  return started at (no climb, no descent)
 *   DESCENDING     slow vertical descent over the home point to HOVER_HEIGHT
 *   LANDING_CHECK  hovers with virtual sticks OFF, so the remote can nudge it;
 *                  waits for the pilot to confirm the landing spot is clear
 *   LANDING        DJI auto-landing; DJI's landing protection may ask for one
 *                  more confirmation just above the ground
 *   LANDED / CANCELLED / FAILED
 *
 * Pause (any flying phase) stops the aircraft and hands control back to the
 * remote; continue re-takes virtual sticks and carries on from the same phase.
 * If virtual sticks are switched off from elsewhere (the remote's pause
 * button, DJI), the return pauses itself.
 *
 * Horizontal control uses the same GROUND-frame velocity mapping as
 * KMLVirtualStickExecutor (pitch = east, roll = north), which is the mapping
 * flown on the Mini 3.
 */
class ReturnToStartController(
  private val emit: (Map<String, Any?>) -> Unit,
  private val isVirtualStickEnabled: () -> Boolean?,
) {
  companion object {
    private const val TAG = "ReturnToStart"
    private const val LOOP_MS = 100L // 10 Hz, like the route executor
    private const val REPORT_EVERY = 5 // state report every 0.5 s
    const val MAX_SPEED = 1.5 // m/s, same ceiling as the routes
    private const val MIN_SPEED = 0.3 // m/s while still more than ARRIVAL_RADIUS away
    private const val DECELERATION_DISTANCE = 8.0 // m
    const val ARRIVAL_RADIUS = 1.5 // m from the home point
    private const val ALTITUDE_GAIN = 0.5 // (m/s) per metre of altitude error while cruising
    private const val MAX_CRUISE_VERTICAL = 0.5 // m/s correction while holding altitude
    const val DESCENT_SPEED = 0.5 // m/s
    private const val FINAL_DESCENT_SPEED = 0.3 // m/s in the last FINAL_DESCENT_BAND metres
    private const val FINAL_DESCENT_BAND = 2.0 // m
    const val HOVER_HEIGHT = 3.0 // m above the take-off point, where the pilot is asked
    const val MAX_RETURN_DISTANCE = 1000.0 // m; beyond this the home point is suspect
    // DJI's stick-state update can lag a moment behind enableVirtualStick.
    private const val VS_LOST_GRACE_MS = 2000L
  }

  enum class Phase { IDLE, RETURNING, DESCENDING, LANDING_CHECK, LANDING, LANDED, CANCELLED, FAILED }

  @Volatile var phase = Phase.IDLE
    private set
  @Volatile private var paused = false
  @Volatile private var pauseReason: String? = null
  @Volatile private var landingConfirmationNeeded = false
  @Volatile private var lastError: String? = null
  private var home: LocationCoordinate2D? = null
  private var cruiseAltitude = 0.0
  private var distanceToHome: Double? = null
  private var altitude: Double? = null
  private var groundHeight: Double? = null
  private var waitingForGps = false
  private var vsLostSince = 0L
  private var job: Job? = null

  val isActive: Boolean
    get() = phase == Phase.RETURNING || phase == Phase.DESCENDING || phase == Phase.LANDING_CHECK || phase == Phase.LANDING

  fun state(): Map<String, Any?> = mapOf(
    "phase" to phase.name.lowercase(),
    "paused" to paused,
    "pauseReason" to pauseReason,
    "distanceToHome" to distanceToHome,
    "altitude" to altitude,
    "groundHeight" to groundHeight,
    "cruiseAltitude" to cruiseAltitude,
    "hoverHeight" to HOVER_HEIGHT,
    "waitingForGps" to waitingForGps,
    "landingConfirmationNeeded" to landingConfirmationNeeded,
    "home" to home?.let { mapOf("latitude" to it.latitude, "longitude" to it.longitude) },
    "error" to lastError,
    "at" to System.currentTimeMillis().toDouble(),
  )

  private fun report() = emit(state())

  /** Checks everything, then starts flying home. Returns an error message instead of starting. */
  fun start(onStarted: (String?) -> Unit) {
    if (isActive) return onStarted("Return to start is already running")
    val flying = FlightControllerKey.KeyIsFlying.create().get(false) == true
    if (!flying) return onStarted("The drone is not flying")
    val homeSet = FlightControllerKey.KeyIsHomeLocationSet.create().get(false) == true
    val homePoint = FlightControllerKey.KeyHomeLocation.create().get()
    if (!homeSet || homePoint == null || (homePoint.latitude == 0.0 && homePoint.longitude == 0.0)) {
      return onStarted("DJI has no take-off point recorded (it needs GPS at take-off)")
    }
    val here = FlightControllerKey.KeyAircraftLocation3D.create().get()
    if (here == null || (here.latitude == 0.0 && here.longitude == 0.0)) {
      return onStarted("No GPS position from the drone yet")
    }
    val distance = distanceMeters(here.latitude, here.longitude, homePoint.latitude, homePoint.longitude)
    if (distance > MAX_RETURN_DISTANCE) {
      return onStarted("The take-off point is ${distance.toInt()} m away, more than the ${MAX_RETURN_DISTANCE.toInt()} m this return allows")
    }

    home = homePoint
    cruiseAltitude = FlightControllerKey.KeyAltitude.create().get() ?: here.altitude
    distanceToHome = distance
    altitude = cruiseAltitude
    paused = false
    pauseReason = null
    landingConfirmationNeeded = false
    lastError = null
    vsLostSince = 0L
    // Already overhead: skip straight to the descent.
    phase = if (distance <= ARRIVAL_RADIUS) Phase.DESCENDING else Phase.RETURNING
    Log.i(TAG, "start: ${distance.toInt()} m to home, holding ${"%.1f".format(cruiseAltitude)} m")

    takeSticks { error ->
      if (error != null) {
        phase = Phase.FAILED
        lastError = "Could not take control: $error"
        report()
        onStarted(lastError)
      } else {
        report()
        runLoop()
        onStarted(null)
      }
    }
  }

  /** Stops the aircraft where it is and gives the remote control. */
  fun pause(reason: String? = null): String? {
    if (phase != Phase.RETURNING && phase != Phase.DESCENDING) return "Nothing to pause"
    if (paused) return null
    paused = true
    pauseReason = reason
    hover()
    releaseSticks()
    report()
    return null
  }

  fun resume(onDone: (String?) -> Unit) {
    if ((phase != Phase.RETURNING && phase != Phase.DESCENDING) || !paused) return onDone("Nothing to continue")
    takeSticks { error ->
      if (error != null) {
        lastError = "Could not take control again: $error"
        report()
        onDone(lastError)
      } else {
        paused = false
        pauseReason = null
        vsLostSince = 0L
        report()
        onDone(null)
      }
    }
  }

  /** The pilot confirmed the landing spot: DJI auto-landing from the hover. */
  fun land(onDone: (String?) -> Unit) {
    if (phase != Phase.LANDING_CHECK) return onDone("The drone is not waiting to land")
    FlightControllerKey.KeyStartAutoLanding.create().action(
      onSuccess = { _: EmptyMsg ->
        phase = Phase.LANDING
        landingConfirmationNeeded = false
        report()
        onDone(null)
      },
      onFailure = { error: IDJIError ->
        lastError = "DJI did not start landing: $error"
        report()
        onDone(lastError)
      },
    )
  }

  /** Answers DJI's landing protection ("is it safe to land here?") with yes. */
  fun confirmLanding(onDone: (String?) -> Unit) {
    if (phase != Phase.LANDING) return onDone("The drone is not landing")
    FlightControllerKey.KeyConfirmLanding.create().action(
      onSuccess = { _: EmptyMsg ->
        landingConfirmationNeeded = false
        report()
        onDone(null)
      },
      onFailure = { error: IDJIError -> onDone("DJI did not accept the confirmation: $error") },
    )
  }

  /** Stops everything; the aircraft hovers and the remote has control. */
  fun cancel(onDone: (String?) -> Unit) {
    if (!isActive) return onDone(null)
    val wasLanding = phase == Phase.LANDING
    job?.cancel()
    hover()
    releaseSticks()
    phase = Phase.CANCELLED
    paused = false
    landingConfirmationNeeded = false
    if (wasLanding) {
      FlightControllerKey.KeyStopAutoLanding.create().action(
        onSuccess = { _: EmptyMsg -> report(); onDone(null) },
        onFailure = { error: IDJIError ->
          lastError = "DJI did not stop the landing: $error"
          report()
          onDone(lastError)
        },
      )
    } else {
      report()
      onDone(null)
    }
  }

  fun dispose() {
    job?.cancel()
    if (phase == Phase.RETURNING || phase == Phase.DESCENDING) {
      hover()
      releaseSticks()
    }
  }

  private fun runLoop() {
    job?.cancel()
    job = CoroutineScope(Dispatchers.IO).launch {
      var tick = 0
      while (isActive && this@ReturnToStartController.isActive) {
        try {
          step()
        } catch (e: Exception) {
          Log.e(TAG, "step failed", e)
          fail("Control error: ${e.message}")
        }
        if (tick++ % REPORT_EVERY == 0) report()
        delay(LOOP_MS)
      }
      report()
    }
  }

  private fun step() {
    readTelemetry()
    when (phase) {
      Phase.RETURNING, Phase.DESCENDING -> {
        if (paused) return
        if (sticksLost()) {
          pause("Virtual sticks were switched off (the remote's pause button or DJI)")
          return
        }
        if (phase == Phase.RETURNING) stepReturning() else stepDescending()
      }
      Phase.LANDING -> {
        landingConfirmationNeeded = FlightControllerKey.KeyIsLandingConfirmationNeeded.create().get(false) == true
        val motorsOn = FlightControllerKey.KeyAreMotorsOn.create().get(true) == true
        val flying = FlightControllerKey.KeyIsFlying.create().get(true) == true
        if (!motorsOn || !flying) {
          phase = Phase.LANDED
          landingConfirmationNeeded = false
          report()
        }
      }
      else -> Unit
    }
  }

  private var position: LocationCoordinate3D? = null

  private fun readTelemetry() {
    position = FlightControllerKey.KeyAircraftLocation3D.create().get()
    altitude = FlightControllerKey.KeyAltitude.create().get() ?: position?.altitude
    // Downward sensor, in decimetres; 0 means no reading.
    val ultrasonic = FlightControllerKey.KeyUltrasonicHeight.create().get(0) ?: 0
    groundHeight = if (ultrasonic > 0) ultrasonic / 10.0 else null
    val p = position
    val h = home
    waitingForGps = p == null || (p.latitude == 0.0 && p.longitude == 0.0)
    if (!waitingForGps && p != null && h != null) distanceToHome = distanceMeters(p.latitude, p.longitude, h.latitude, h.longitude)
  }

  private fun sticksLost(): Boolean {
    if (isVirtualStickEnabled() != false) {
      vsLostSince = 0L
      return false
    }
    val now = System.currentTimeMillis()
    if (vsLostSince == 0L) vsLostSince = now
    return now - vsLostSince > VS_LOST_GRACE_MS
  }

  private fun stepReturning() {
    val p = position
    val h = home ?: return fail("Take-off point lost")
    if (waitingForGps || p == null) return hover()
    val distance = distanceToHome ?: return hover()
    if (distance <= ARRIVAL_RADIUS) {
      phase = Phase.DESCENDING
      report()
      return hover()
    }
    val speed = if (distance > DECELERATION_DISTANCE) MAX_SPEED else max(MIN_SPEED, MAX_SPEED * distance / DECELERATION_DISTANCE)
    val altitudeError = cruiseAltitude - (altitude ?: cruiseAltitude)
    val vertical = if (abs(altitudeError) < 0.3) 0.0 else (altitudeError * ALTITUDE_GAIN).coerceIn(-MAX_CRUISE_VERTICAL, MAX_CRUISE_VERTICAL)
    send(velocityTowards(p, h, speed), vertical)
  }

  private fun stepDescending() {
    val p = position
    val h = home ?: return fail("Take-off point lost")
    val height = altitude ?: return hover()
    val nearest = min(height, groundHeight ?: Double.MAX_VALUE)
    if (nearest <= HOVER_HEIGHT) {
      hover()
      releaseSticks()
      phase = Phase.LANDING_CHECK
      report()
      return
    }
    // Keep over the point with gentle corrections while going down.
    val horizontal = if (waitingForGps || p == null) Pair(0.0, 0.0) else {
      val distance = distanceToHome ?: 0.0
      if (distance < 0.5) Pair(0.0, 0.0) else velocityTowards(p, h, min(0.5, distance * 0.3))
    }
    val speed = if (nearest - HOVER_HEIGHT < FINAL_DESCENT_BAND) FINAL_DESCENT_SPEED else DESCENT_SPEED
    send(horizontal, -speed)
  }

  private fun fail(message: String) {
    lastError = message
    phase = Phase.FAILED
    hover()
    releaseSticks()
    report()
  }

  /** (north, east) velocity in m/s towards the target. */
  private fun velocityTowards(from: LocationCoordinate3D, to: LocationCoordinate2D, speed: Double): Pair<Double, Double> {
    val bearing = Math.toRadians(bearingDegrees(from.latitude, from.longitude, to.latitude, to.longitude))
    return Pair(speed * cos(bearing), speed * sin(bearing))
  }

  private fun send(velocity: Pair<Double, Double>, vertical: Double) {
    val (north, east) = velocity
    val param = VirtualStickFlightControlParam().apply {
      // Same mapping as KMLVirtualStickExecutor (flown on the Mini 3).
      pitch = east.coerceIn(-MAX_SPEED, MAX_SPEED)
      roll = north.coerceIn(-MAX_SPEED, MAX_SPEED)
      yaw = 0.0
      verticalThrottle = vertical
      rollPitchControlMode = RollPitchControlMode.VELOCITY
      yawControlMode = YawControlMode.ANGULAR_VELOCITY
      verticalControlMode = VerticalControlMode.VELOCITY
      rollPitchCoordinateSystem = FlightCoordinateSystem.GROUND
    }
    VirtualStickManager.getInstance().sendVirtualStickAdvancedParam(param)
  }

  private fun hover() {
    val stop = VirtualStickFlightControlParam().apply {
      pitch = 0.0
      roll = 0.0
      yaw = 0.0
      verticalThrottle = 0.0
      rollPitchControlMode = RollPitchControlMode.VELOCITY
      yawControlMode = YawControlMode.ANGULAR_VELOCITY
      verticalControlMode = VerticalControlMode.VELOCITY
      rollPitchCoordinateSystem = FlightCoordinateSystem.GROUND
    }
    repeat(3) { VirtualStickManager.getInstance().sendVirtualStickAdvancedParam(stop) }
  }

  private fun takeSticks(done: (String?) -> Unit) {
    try {
      VirtualStickManager.getInstance().setVirtualStickAdvancedModeEnabled(true)
    } catch (e: Exception) {
      Log.w(TAG, "advanced mode: ${e.message}")
    }
    VirtualStickManager.getInstance().enableVirtualStick(object : CommonCallbacks.CompletionCallback {
      override fun onSuccess() = done(null)
      override fun onFailure(error: IDJIError) = done(error.toString())
    })
  }

  private fun releaseSticks() {
    VirtualStickManager.getInstance().disableVirtualStick(object : CommonCallbacks.CompletionCallback {
      override fun onSuccess() {}
      override fun onFailure(error: IDJIError) {
        Log.w(TAG, "disable virtual stick: $error")
      }
    })
  }

  private fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = sin(dLat / 2) * sin(dLat / 2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2) * sin(dLon / 2)
    return 6371000 * 2 * atan2(sqrt(a), sqrt(1 - a))
  }

  private fun bearingDegrees(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val phi1 = Math.toRadians(lat1)
    val phi2 = Math.toRadians(lat2)
    val dLon = Math.toRadians(lon2 - lon1)
    val y = sin(dLon) * cos(phi2)
    val x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dLon)
    return (Math.toDegrees(atan2(y, x)) + 360) % 360
  }
}
