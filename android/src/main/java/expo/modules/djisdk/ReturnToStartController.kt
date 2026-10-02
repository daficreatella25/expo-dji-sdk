package expo.modules.djisdk

import android.util.Log
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.sdk.keyvalue.value.common.LocationCoordinate2D
import dji.sdk.keyvalue.value.common.LocationCoordinate3D
import dji.sdk.keyvalue.value.flightcontroller.FlightCoordinateSystem
import dji.sdk.keyvalue.value.flightcontroller.FlightMode
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
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
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
 *   DESCENDING     vertical descent over the home point to HOVER_HEIGHT: quick
 *                  when high, easing off over the last few metres
 *   LANDING_CHECK  hovers with virtual sticks OFF, so the remote can nudge it;
 *                  waits for the pilot to confirm the landing spot is clear, or,
 *                  with an auto-land delay, lands when the countdown runs out
 *   LANDING        DJI auto-landing; DJI's landing protection may ask for one
 *                  more confirmation just above the ground
 *   LANDED / CANCELLED / FAILED
 *
 * Pause while returning or descending stops the aircraft and hands control
 * back to the remote; continue re-takes virtual sticks and carries on from the
 * same phase. Pause at the landing check holds the countdown; pause while
 * landing stops DJI's landing and goes back to the (held) landing check.
 * If virtual sticks are switched off (or their state is unknown) for more
 * than 2 s, the return pauses itself. The countdown holds when the drone is
 * more than 3 m off the start point or has no GPS; "Land now" still works.
 * Not flying with the motors off ends it as LANDED from any phase.
 *
 * Every state change and the control loop run on one thread; the public
 * methods post onto it and answer through their callbacks.
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
    const val MAX_SPEED = 3.0 // m/s; no photos on the way back, so faster than the routes
    private const val MIN_SPEED = 0.3 // m/s while still more than ARRIVAL_RADIUS away
    private const val DECELERATION_DISTANCE = 12.0 // m
    const val ARRIVAL_RADIUS = 1.5 // m from the home point
    private const val ALTITUDE_GAIN = 0.5 // (m/s) per metre of altitude error while cruising
    private const val MAX_CRUISE_VERTICAL = 0.5 // m/s correction while holding altitude
    // Descent speed = DESCENT_GAIN × metres above the hover height, between
    // MIN_DESCENT_SPEED and MAX_DESCENT_SPEED: 50 m → 3 m takes about 25 s.
    const val MAX_DESCENT_SPEED = 2.5 // m/s, under DJI's 3 m/s so it stays out of its own downwash
    private const val MIN_DESCENT_SPEED = 0.4 // m/s
    private const val DESCENT_GAIN = 0.5 // (m/s) per metre
    const val HOVER_HEIGHT = 3.0 // m above the take-off point, where the pilot is asked
    const val MAX_RETURN_DISTANCE = 1000.0 // m; beyond this the home point is suspect
    // DJI's stick-state update can lag a moment behind enableVirtualStick.
    private const val VS_LOST_GRACE_MS = 2000L
    private const val TAKE_STICKS_TIMEOUT_MS = 10_000L
    /** The countdown holds when the drone is further than this from the home point. */
    const val OFF_POINT_RADIUS = 3.0 // m
    const val ALREADY_RUNNING = "Return to start is already running"

    /** DJI's own return home and landings: never continue against these. */
    private val DJI_TAKEOVER_MODES = setOf(
      FlightMode.GO_HOME, FlightMode.AUTO_LANDING, FlightMode.FORCE_LANDING, FlightMode.ATTI_LANDING,
    )

    private val dispatcher = Executors.newSingleThreadExecutor { r ->
      Thread(r, "ReturnToStart").apply { isDaemon = true }
    }.asCoroutineDispatcher()
  }

  // An unexpected error fails the return (sticks released); it must never crash the app mid-flight.
  private val scope = CoroutineScope(SupervisorJob() + dispatcher + CoroutineExceptionHandler { _, e -> onThreadError(e) })

  private fun onThreadError(e: Throwable) {
    Log.e(TAG, "return thread error", e)
    scope.launch { if (phase == Phase.RETURNING || phase == Phase.DESCENDING) fail("Control error: ${e.message}") }
  }

  /** Calls through at most once: an Expo promise settled twice throws (and crashes a release build). */
  private fun once(onDone: (String?) -> Unit): (String?) -> Unit {
    val called = AtomicBoolean(false)
    return { error -> if (called.compareAndSet(false, true)) onDone(error) }
  }

  /** Runs [block] on the controller thread; [onDone] hears about an unexpected error instead of waiting forever. */
  private fun post(onDone: ((String?) -> Unit)?, block: () -> Unit) {
    scope.launch {
      try {
        block()
      } catch (e: Exception) {
        Log.e(TAG, "command failed", e)
        onDone?.invoke("Return to start error: ${e.message}")
      }
    }
  }

  enum class Phase { IDLE, RETURNING, DESCENDING, LANDING_CHECK, LANDING, LANDED, CANCELLED, FAILED }

  @Volatile var phase = Phase.IDLE
    private set
  @Volatile private var paused = false
  @Volatile private var pauseReason: String? = null
  @Volatile private var landingConfirmationNeeded = false
  @Volatile private var lastError: String? = null
  /** Countdown length at the landing check; 0 waits for the pilot. */
  @Volatile private var autoLandAfterMs = 0L
  /** When the countdown lands the drone (epoch ms); 0 = no countdown running. */
  @Volatile private var autoLandAt = 0L
  /** The route that just finished asked for this return (vs. the pilot's button). */
  @Volatile private var afterRoute = false
  // Written on the controller thread, read by state() from any thread.
  @Volatile private var home: LocationCoordinate2D? = null
  @Volatile private var cruiseAltitude = 0.0
  @Volatile private var distanceToHome: Double? = null
  @Volatile private var altitude: Double? = null
  @Volatile private var groundHeight: Double? = null
  @Volatile private var waitingForGps = false
  private var vsLostSince = 0L
  private var job: Job? = null
  /** Bumped by start/cancel/fail: answers from DJI for an earlier return are ignored. */
  private var token = 0
  /** Bumped by every pause or hold: a landing or continue requested before it is undone. */
  private var pauseSeq = 0
  private var landRequestInFlight = false

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
    "autoLandAt" to if (autoLandAt > 0) autoLandAt.toDouble() else null,
    "autoLandAfterMs" to autoLandAfterMs.toDouble(),
    "afterRoute" to afterRoute,
    "home" to home?.let { mapOf("latitude" to it.latitude, "longitude" to it.longitude) },
    "error" to lastError,
    "at" to System.currentTimeMillis().toDouble(),
  )

  private fun report() = emit(state())

  /**
   * Checks everything, then starts flying home. Returns an error message
   * instead of starting. [autoLandAfterMs] > 0 lands on its own after hovering
   * that long at the landing check (the pilot can hold or land sooner).
   */
  fun start(autoLandAfterMs: Long = 0L, afterRoute: Boolean = false, onStarted: (String?) -> Unit) {
    val done = once(onStarted)
    post(done) { startNow(autoLandAfterMs, afterRoute, done) }
  }

  private fun startNow(autoLandAfterMs: Long, afterRoute: Boolean, onStarted: (String?) -> Unit) {
    if (isActive) return onStarted(ALREADY_RUNNING)
    val flying = FlightControllerKey.KeyIsFlying.create().get(false) == true
    if (!flying) return onStarted("The drone is not flying")
    djiTakeover()?.let { return onStarted(it) }
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
    landRequestInFlight = false
    this.autoLandAfterMs = autoLandAfterMs.coerceAtLeast(0L)
    this.afterRoute = afterRoute
    autoLandAt = 0L
    // Already overhead: skip straight to the descent.
    phase = if (distance <= ARRIVAL_RADIUS) Phase.DESCENDING else Phase.RETURNING
    val myToken = ++token
    Log.i(TAG, "start: ${distance.toInt()} m to home, holding ${"%.1f".format(cruiseAltitude)} m")

    takeSticks { error ->
      if (myToken != token || (phase != Phase.RETURNING && phase != Phase.DESCENDING)) {
        // Cancelled while DJI was handing over: nobody flies with these sticks.
        if (error == null) releaseSticks()
        return@takeSticks onStarted("Return to start was cancelled")
      }
      if (error != null) {
        token++
        phase = Phase.FAILED
        lastError = "Could not take control: $error"
        report()
        onStarted(lastError)
      } else {
        // Paused while DJI was handing over: the remote keeps control.
        if (paused) releaseSticks()
        report()
        runLoop()
        onStarted(null)
      }
    }
  }

  /**
   * Stops the aircraft where it is and gives the remote control. At the
   * landing check it holds the countdown; while landing it stops DJI's landing
   * and hovers (back to a held landing check).
   */
  fun pause(reason: String? = null, onDone: (String?) -> Unit = {}) {
    val done = once(onDone)
    post(done) { pauseNow(reason, done) }
  }

  private fun pauseNow(reason: String?, onDone: (String?) -> Unit) {
    when (phase) {
      Phase.LANDING_CHECK -> {
        hold(reason)
        onDone(null)
      }
      Phase.LANDING -> {
        pauseSeq++
        val myToken = token
        FlightControllerKey.KeyStopAutoLanding.create().action(
          onSuccess = { _: EmptyMsg ->
            post(onDone) {
              if (myToken == token && phase == Phase.LANDING) {
                phase = Phase.LANDING_CHECK
                landingConfirmationNeeded = false
                hold(reason)
              }
              onDone(null)
            }
          },
          onFailure = { error: IDJIError ->
            post(onDone) {
              lastError = "DJI did not stop the landing: $error"
              report()
              onDone(lastError)
            }
          },
        )
      }
      Phase.RETURNING, Phase.DESCENDING -> {
        // Every pause counts, so a continue already on its way does not undo it.
        pauseSeq++
        if (!paused) {
          paused = true
          hoverIfHeld()
          releaseSticks()
        }
        pauseReason = reason
        report()
        onDone(null)
      }
      else -> onDone("Nothing to pause")
    }
  }

  /** Landing check: hold the countdown (the pilot continues or taps Land now). */
  private fun hold(reason: String?) {
    pauseSeq++
    paused = true
    pauseReason = reason
    autoLandAt = 0L
    report()
  }

  fun resume(onDone: (String?) -> Unit) {
    val done = once(onDone)
    post(done) { resumeNow(done) }
  }

  private fun resumeNow(onDone: (String?) -> Unit) {
    if (!isActive || !paused) return onDone("Nothing to continue")
    djiTakeover()?.let { return onDone("$it; wait for it to finish or fly with the remote") }
    if (phase == Phase.LANDING_CHECK) {
      // Continue = run the countdown again (or just wait, without one).
      paused = false
      pauseReason = null
      startCountdown()
      report()
      return onDone(null)
    }
    if (phase != Phase.RETURNING && phase != Phase.DESCENDING) return onDone("Nothing to continue")
    if (FlightControllerKey.KeyIsFlying.create().get(false) != true) return onDone("The drone is not flying")
    val myToken = token
    val seq = pauseSeq
    takeSticks { error ->
      if (myToken != token || seq != pauseSeq || !paused || (phase != Phase.RETURNING && phase != Phase.DESCENDING)) {
        // Paused again, cancelled or landed meanwhile: stay as we are.
        if (error == null) releaseSticks()
        return@takeSticks onDone(pauseReason ?: "The return changed while continuing")
      }
      if (error != null) {
        // Still paused, remote in control; the pilot can try again or cancel.
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

  /** The pilot confirmed the landing spot: DJI auto-landing from the hover (also when held). */
  fun land(onDone: (String?) -> Unit) {
    val done = once(onDone)
    post(done) { landNow(internal = false, onDone = done) }
  }

  /** [internal]: the countdown ran out; it never lands a held drone. */
  private fun landNow(internal: Boolean, onDone: (String?) -> Unit) {
    if (phase != Phase.LANDING_CHECK) return onDone("The drone is not waiting to land")
    if (internal && paused) return onDone("The landing is held")
    if (landRequestInFlight) return onDone(null)
    djiTakeover()?.let { return onDone(it) }
    autoLandAt = 0L
    landRequestInFlight = true
    val myToken = token
    val seq = pauseSeq
    FlightControllerKey.KeyStartAutoLanding.create().action(
      onSuccess = { _: EmptyMsg ->
        post(onDone) {
          landRequestInFlight = false
          if (myToken != token || phase != Phase.LANDING_CHECK || seq != pauseSeq) {
            // Held, cancelled or landed while DJI was starting: undo the landing unless it is down.
            if (phase != Phase.LANDED) stopAutoLanding()
            report()
            return@post onDone(pauseReason ?: "The landing was stopped")
          }
          landingOffSince = 0L
          phase = Phase.LANDING
          paused = false
          pauseReason = null
          landingConfirmationNeeded = false
          report()
          onDone(null)
        }
      },
      onFailure = { error: IDJIError ->
        post(onDone) {
          landRequestInFlight = false
          lastError = "DJI did not start landing: $error"
          report()
          onDone(lastError)
        }
      },
    )
  }

  private fun stopAutoLanding() {
    FlightControllerKey.KeyStopAutoLanding.create().action(
      onSuccess = { _: EmptyMsg -> },
      onFailure = { error: IDJIError -> Log.w(TAG, "stop auto-landing: $error") },
    )
  }

  /** Answers DJI's landing protection ("is it safe to land here?") with yes. */
  fun confirmLanding(onDone: (String?) -> Unit) = once(onDone).let { done -> confirmLandingNow(done) }

  private fun confirmLandingNow(onDone: (String?) -> Unit) = post(onDone) {
    if (phase != Phase.LANDING) return@post onDone("The drone is not landing")
    FlightControllerKey.KeyConfirmLanding.create().action(
      onSuccess = { _: EmptyMsg ->
        post(onDone) {
          landingConfirmationNeeded = false
          report()
          onDone(null)
        }
      },
      onFailure = { error: IDJIError -> onDone("DJI did not accept the confirmation: $error") },
    )
  }

  /** Stops everything; the aircraft hovers and the remote has control. */
  fun cancel(onDone: (String?) -> Unit) = once(onDone).let { done -> cancelNow(done) }

  private fun cancelNow(onDone: (String?) -> Unit) = post(onDone) {
    if (!isActive) return@post onDone(null)
    val wasLanding = phase == Phase.LANDING
    val hadSticks = (phase == Phase.RETURNING || phase == Phase.DESCENDING) && !paused
    token++
    job?.cancel()
    if (hadSticks) hoverIfHeld()
    releaseSticks()
    phase = Phase.CANCELLED
    paused = false
    autoLandAt = 0L
    landingConfirmationNeeded = false
    landRequestInFlight = false
    if (wasLanding) {
      FlightControllerKey.KeyStopAutoLanding.create().action(
        onSuccess = { _: EmptyMsg -> post(onDone) { report(); onDone(null) } },
        onFailure = { error: IDJIError ->
          post(onDone) {
            lastError = "DJI did not stop the landing: $error"
            report()
            onDone(lastError)
          }
        },
      )
    } else {
      report()
      onDone(null)
    }
  }

  /**
   * The link to the drone dropped: nothing sent now reaches it, and DJI's own
   * failsafe flies it. Hold the return so nothing carries on by itself when
   * the link comes back. While DJI is landing it keeps landing.
   */
  fun onDisconnected() = post(null) {
    when (phase) {
      Phase.RETURNING, Phase.DESCENDING, Phase.LANDING_CHECK -> pauseNow("Drone disconnected") {}
      else -> Unit
    }
  }

  fun dispose() = post(null) {
    token++
    job?.cancel()
    autoLandAt = 0L
    if ((phase == Phase.RETURNING || phase == Phase.DESCENDING) && !paused) {
      hoverIfHeld()
      releaseSticks()
    }
  }

  private fun runLoop() {
    job?.cancel()
    job = scope.launch {
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
    // On the ground with the motors off, whatever the phase (DJI, the remote, or our landing).
    if (hasLanded()) {
      val hadSticks = (phase == Phase.RETURNING || phase == Phase.DESCENDING) && !paused
      token++
      phase = Phase.LANDED
      paused = false
      pauseReason = null
      autoLandAt = 0L
      landingConfirmationNeeded = false
      if (hadSticks) releaseSticks()
      Log.i(TAG, "landed")
      report()
      return
    }
    when (phase) {
      Phase.RETURNING, Phase.DESCENDING -> {
        if (paused) return
        if (sticksLost()) {
          pauseNow("Virtual sticks were switched off (the remote's pause button or DJI)") {}
          return
        }
        if (phase == Phase.RETURNING) stepReturning() else stepDescending()
      }
      Phase.LANDING_CHECK -> {
        val at = autoLandAt
        if (at > 0 && !paused) {
          val distance = distanceToHome
          when {
            waitingForGps -> hold("No GPS position; landing held")
            distance != null && distance > OFF_POINT_RADIUS -> hold("Moved off the start point")
            System.currentTimeMillis() >= at -> {
              autoLandAt = 0L
              landNow(internal = true) { error -> if (error != null) Log.w(TAG, "auto-land: $error") }
            }
          }
        }
      }
      Phase.LANDING -> {
        landingConfirmationNeeded = FlightControllerKey.KeyIsLandingConfirmationNeeded.create().get(false) == true
        if (landingStoppedElsewhere()) {
          // Throttle up on the remote (or DJI) ended the landing: hover, held.
          phase = Phase.LANDING_CHECK
          landingConfirmationNeeded = false
          hold("Landing stopped from the remote")
        }
      }
      else -> Unit
    }
  }

  /** Not flying and motors off; unknown readings count as still flying. */
  private fun hasLanded(): Boolean {
    val flying = FlightControllerKey.KeyIsFlying.create().get(true) == true
    val motorsOn = FlightControllerKey.KeyAreMotorsOn.create().get(true) == true
    return !flying && !motorsOn
  }

  /** Why DJI's own return or landing blocks us, or null. */
  private fun djiTakeover(): String? {
    val mode = FlightControllerKey.KeyFlightMode.create().get(FlightMode.UNKNOWN)
    if (mode !in DJI_TAKEOVER_MODES) return null
    return if (mode == FlightMode.GO_HOME) "DJI is flying home on its own" else "DJI is landing the drone"
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

  private var landingOffSince = 0L

  /** Flying, but no longer in a DJI landing mode for a couple of seconds. */
  private fun landingStoppedElsewhere(): Boolean {
    // Touched down with the motors still spinning is not "stopped": wait for them to stop.
    if (FlightControllerKey.KeyIsFlying.create().get(true) != true) {
      landingOffSince = 0L
      return false
    }
    val mode = FlightControllerKey.KeyFlightMode.create().get(FlightMode.UNKNOWN)
    val landingMode = mode == FlightMode.AUTO_LANDING || mode == FlightMode.FORCE_LANDING ||
      mode == FlightMode.ATTI_LANDING || mode == FlightMode.UNKNOWN
    if (landingMode || landingConfirmationNeeded) {
      landingOffSince = 0L
      return false
    }
    val now = System.currentTimeMillis()
    if (landingOffSince == 0L) landingOffSince = now
    return now - landingOffSince > VS_LOST_GRACE_MS
  }

  /** Sticks off, or no stick state at all, for more than the grace period. */
  private fun sticksLost(): Boolean {
    if (isVirtualStickEnabled() == true) {
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
      startCountdown()
      report()
      return
    }
    // Keep over the point with gentle corrections while going down.
    val horizontal = if (waitingForGps || p == null) Pair(0.0, 0.0) else {
      val distance = distanceToHome ?: 0.0
      if (distance < 0.5) Pair(0.0, 0.0) else velocityTowards(p, h, min(0.5, distance * 0.3))
    }
    send(horizontal, -descentSpeed(nearest - HOVER_HEIGHT))
  }

  /** Descent speed (m/s) at [above] metres over the hover height. */
  private fun descentSpeed(above: Double): Double = (above * DESCENT_GAIN).coerceIn(MIN_DESCENT_SPEED, MAX_DESCENT_SPEED)

  private fun startCountdown() {
    autoLandAt = if (autoLandAfterMs > 0) System.currentTimeMillis() + autoLandAfterMs else 0L
  }

  private fun fail(message: String) {
    val hadSticks = (phase == Phase.RETURNING || phase == Phase.DESCENDING) && !paused
    token++
    lastError = message
    phase = Phase.FAILED
    if (hadSticks) hoverIfHeld()
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
    try {
      repeat(3) { VirtualStickManager.getInstance().sendVirtualStickAdvancedParam(stop) }
    } catch (e: Exception) {
      Log.w(TAG, "hover: ${e.message}")
    }
  }

  /** [done] runs on the controller thread: null once DJI hands over, else the error (also after 10 s without an answer). */
  /** Hover before handing over, but only with sticks we still hold (never against DJI's own return or landing). */
  private fun hoverIfHeld() {
    if (isVirtualStickEnabled() == true) hover()
  }

  private fun takeSticks(done: (String?) -> Unit) {
    try {
      VirtualStickManager.getInstance().setVirtualStickAdvancedModeEnabled(true)
    } catch (e: Exception) {
      Log.w(TAG, "advanced mode: ${e.message}")
    }
    val settled = AtomicBoolean(false)
    val answer = { error: String? ->
      if (settled.compareAndSet(false, true)) {
        post(null) { done(error) }
      } else if (error == null) {
        // Handed over after we gave up: nobody flies with them, give them back.
        releaseSticks()
      }
    }
    try {
      VirtualStickManager.getInstance().enableVirtualStick(object : CommonCallbacks.CompletionCallback {
        override fun onSuccess() = answer(null)
        override fun onFailure(error: IDJIError) = answer(error.toString())
      })
    } catch (e: Exception) {
      answer(e.message ?: e.toString())
    }
    scope.launch {
      delay(TAKE_STICKS_TIMEOUT_MS)
      answer("DJI did not answer within ${TAKE_STICKS_TIMEOUT_MS / 1000} s")
    }
  }

  private fun releaseSticks() {
    try {
      VirtualStickManager.getInstance().disableVirtualStick(object : CommonCallbacks.CompletionCallback {
        override fun onSuccess() {}
        override fun onFailure(error: IDJIError) {
          Log.w(TAG, "disable virtual stick: $error")
        }
      })
    } catch (e: Exception) {
      Log.w(TAG, "disable virtual stick: ${e.message}")
    }
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
