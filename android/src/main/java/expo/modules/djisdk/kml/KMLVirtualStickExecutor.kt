package expo.modules.djisdk.kml

import android.util.Log
import dji.v5.manager.aircraft.virtualstick.VirtualStickManager
import dji.sdk.keyvalue.value.flightcontroller.*
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.value.common.LocationCoordinate3D
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.et.create
import dji.v5.et.get
import dji.v5.et.action
import kotlinx.coroutines.*
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.*

/**
 * KML Virtual Stick Mission Executor
 * Implements Litchi-style navigation using pure DJI SDK v5
 * Works directly with KML waypoints for consumer drones
 *
 * Every state change and the 10 Hz control loop run on one thread, so a pause
 * or stop from JS, a DJI callback and a control step never interleave.
 *
 * The route pauses itself (hover if it still holds the sticks, then hands them
 * to the remote; only the pilot's Continue takes them again) when:
 *  - the virtual sticks are off or unknown for more than 2 s (the remote's
 *    pause button, DJI, signal loss)
 *  - DJI starts its own return home or landing
 *  - GPS has been missing or weak for 20 s (it hovers meanwhile)
 *  - it has not got 1 m closer to the current waypoint for 60 s
 * It ends exactly once: completed, stopped or failed.
 */
class KMLVirtualStickExecutor(
    /** Latest virtual-stick state from the module's listener; null when unknown. */
    private val isVirtualStickEnabled: () -> Boolean?
) {
    companion object {
        private const val TAG = "KMLVirtualStickExecutor"
        private const val CONTROL_LOOP_INTERVAL = 100L // 10Hz update rate
        private const val ARRIVAL_THRESHOLD_HORIZONTAL = 3.0 // meters
        private const val ARRIVAL_THRESHOLD_VERTICAL = 1.5 // meters
        private const val MAX_HORIZONTAL_SPEED = 1.5 // m/s — slow, for rooftop inspection + clean photos
        private const val MAX_VERTICAL_SPEED = 3.0 // m/s
        private const val MAX_YAW_SPEED = 60.0 // deg/s
        private const val DECELERATION_DISTANCE = 10.0 // meters to start slowing down
        // DJI's stick-state update can lag a moment behind enableVirtualStick.
        private const val VS_LOST_GRACE_MS = 2000L
        private const val TAKEOFF_TIMEOUT_MS = 15_000L
        private const val TAKEOFF_POLL_MS = 200L
        private const val TAKE_STICKS_TIMEOUT_MS = 10_000L
        // DJI answers disableVirtualStick at once; never let a lost answer hold up the end of a route.
        private const val RELEASE_FALLBACK_MS = 3000L
        private const val GPS_WAIT_LIMIT_MS = 20_000L
        private const val STUCK_TIMEOUT_MS = 60_000L
        private const val STUCK_MIN_GAIN = 1.0 // metres closer that count as progress
        // missionProgress: on every waypoint change, otherwise once a second.
        private const val PROGRESS_EVERY_TICKS = (1000L / CONTROL_LOOP_INTERVAL).toInt()

        // missionPaused sources
        const val SOURCE_APP = "app"
        const val SOURCE_LOST_CONTROL = "lostControl"
        const val SOURCE_DJI_MODE = "djiMode"
        const val SOURCE_DISCONNECT = "disconnect"
        const val SOURCE_STUCK = "stuck"
        const val SOURCE_GPS = "gps"

        // missionPhase values
        const val PHASE_TAKING_OFF = "takingOff"
        const val PHASE_CLIMBING = "climbing"
        const val PHASE_FLYING = "flying"
        const val PHASE_WAITING_FOR_GPS = "waitingForGps"

        /** DJI's own return home and landings: the route never fights these. */
        private val DJI_TAKEOVER_MODES = setOf(
            FlightMode.GO_HOME, FlightMode.AUTO_LANDING, FlightMode.FORCE_LANDING, FlightMode.ATTI_LANDING
        )

        private val dispatcher = Executors.newSingleThreadExecutor { r ->
            Thread(r, "KMLRoute").apply { isDaemon = true }
        }.asCoroutineDispatcher()
    }

    private enum class Outcome { COMPLETED, STOPPED, FAILED }

    // An unexpected error ends the route (sticks released); it must never crash the app mid-flight.
    private val scope = CoroutineScope(SupervisorJob() + dispatcher + CoroutineExceptionHandler { _, e -> onRouteThreadError(e) })

    private fun onRouteThreadError(e: Throwable) {
        Log.e(TAG, "Route thread error", e)
        if (isExecuting) scope.launch { fail("Internal error: ${e.message}") }
    }

    @Volatile private var isExecuting = false
    @Volatile private var isPaused = false
    @Volatile private var currentWaypointIndex = 0
    /** True while no route is running; flipped once per route so exactly one of completed/stopped/failed fires. */
    private val finished = AtomicBoolean(true)
    /** Bumped per route: DJI callbacks from an earlier route are ignored. */
    @Volatile private var runId = 0
    private var controlJob: Job? = null
    @Volatile private var callback: KMLMissionManager.KMLMissionCallback? = null
    private var waypoints: List<KMLWaypoint> = emptyList()
    /** Metres along the route from waypoint i to the last one (horizontal). */
    private var routeAfter: DoubleArray = DoubleArray(0)
    // Middle of the route, for faceCenter; computed once per route.
    private var centerLat = 0.0
    private var centerLon = 0.0
    // Control-loop ticks, for throttling (no wall-clock modulo tricks).
    private var loopTick = 0
    private var lastProgressTick = 0
    private var lastProgressWaypoint = -1
    private var faceCenter = false
    private var climbFirst = true
    private var startedReported = false
    private var phase: String? = null
    private var phaseTarget: Double? = null
    private var vsLostSince = 0L
    private var gpsLostSince = 0L
    // Stuck guard: best distance to the current waypoint and when it last improved.
    private var stuckWaypoint = -1
    private var stuckBest = 0.0
    private var stuckSince = 0L
    // From KeyStartTakeoff until the take-off wait hands over to the route.
    private var takingOff = false
    // Continue in flight: a pause that arrives meanwhile wins.
    private var resumeInFlight = false
    private var pauseDuringResume: Pair<String?, String>? = null
    // Waiting for the ended route's stick release (a stop that raced the end joins in).
    private var releaseWaiters: MutableList<() -> Unit>? = null
    /** Ended, but the sticks are not released (and the end not reported) yet. */
    @Volatile private var ending = false


    data class DronePosition(
        val latitude: Double,
        val longitude: Double,
        val altitude: Float,
        val heading: Float
    )

    val isRunning: Boolean
        get() = isExecuting

    /** Running, or ended a moment ago and still handing the sticks back. */
    val isBusy: Boolean
        get() = isExecuting || ending

    val isPausedNow: Boolean
        get() = isExecuting && isPaused

    /** Index of the waypoint being flown to (= waypoints reached so far). */
    val currentWaypoint: Int
        get() = currentWaypointIndex

    /**
     * Starts the route (take-off first when on the ground), flying first to
     * waypoint [startIndex] (0-based, clamped; to continue an interrupted
     * route). Returns null when accepted, otherwise why it was refused;
     * nothing is flown then.
     */
    fun startMission(
        kmlWaypoints: List<KMLWaypoint>,
        callback: KMLMissionManager.KMLMissionCallback,
        faceCenter: Boolean = false,
        climbFirst: Boolean = true,
        startIndex: Int = 0
    ): String? {
        if (kmlWaypoints.isEmpty()) return "The route has no waypoints"
        if (ending) return "The previous route is still handing back control; try again in a moment"
        if (!finished.compareAndSet(true, false)) {
            Log.w(TAG, "Mission already executing")
            return "A route is already running"
        }
        val firstIndex = startIndex.coerceIn(0, kmlWaypoints.size - 1)
        isExecuting = true
        isPaused = false
        // Absolute numbers throughout: progress for a continued route counts from the full route.
        currentWaypointIndex = firstIndex
        scope.launch {
            runId++
            this@KMLVirtualStickExecutor.waypoints = kmlWaypoints
            routeAfter = DoubleArray(kmlWaypoints.size).also { after ->
                for (i in kmlWaypoints.size - 2 downTo 0) after[i] = after[i + 1] + distanceBetween(kmlWaypoints[i], kmlWaypoints[i + 1])
            }
            centerLat = kmlWaypoints.map { it.latitude }.average()
            centerLon = kmlWaypoints.map { it.longitude }.average()
            lastProgressWaypoint = -1
            this@KMLVirtualStickExecutor.callback = callback
            this@KMLVirtualStickExecutor.faceCenter = faceCenter
            this@KMLVirtualStickExecutor.climbFirst = climbFirst
            startedReported = false
            takingOff = false
            phase = null
            phaseTarget = null
            resetGuards()
            resumeInFlight = false
            pauseDuringResume = null

            Log.i(TAG, "Starting route: ${kmlWaypoints.size} waypoints, first target ${firstIndex + 1}")

            // Check if drone is flying, if not, initiate takeoff first
            checkFlightStatusAndProceed(runId)
        }
        return null
    }

    /**
     * Stops the aircraft where it is and gives the remote control. [source]
     * says why (SOURCE_*); [reason] is shown to the pilot.
     */
    fun pauseMission(reason: String?, source: String, onDone: (String?) -> Unit = {}) {
        val onDone = once(onDone)
        scope.launch {
            if (!isExecuting) return@launch onDone("No route is running")
            if (resumeInFlight) pauseDuringResume = Pair(reason, source)
            if (isPaused) return@launch onDone(null)
            pauseNow(reason, source)
            onDone(null)
        }
    }

    /**
     * Takes the sticks again and carries on, unless DJI is flying its own
     * return or landing, or the drone is not in the air. [onDone] gets null on
     * success, otherwise why not (the route stays paused, or failed if DJI
     * would not hand the sticks back).
     */
    fun resumeMission(onDone: (String?) -> Unit) {
        val onDone = once(onDone)
        scope.launch {
            if (!isExecuting) return@launch onDone("No route is running")
            if (!isPaused) return@launch onDone(null)
            if (resumeInFlight) return@launch onDone("Already continuing")
            flightMode()?.takeIf { it in DJI_TAKEOVER_MODES }?.let {
                return@launch onDone("${djiModeReason(it)}; wait for it to finish or fly with the remote")
            }
            if (takingOff) {
                // Still in DJI's take-off: the take-off wait takes the sticks when it is done.
                isPaused = false
                callback?.onMissionResumed()
                return@launch onDone(null)
            }
            if (!isFlyingNow()) return@launch onDone("The drone is not flying")

            Log.i(TAG, "Resuming route")
            val run = runId
            resumeInFlight = true
            pauseDuringResume = null
            enableVirtualStickMode { error ->
                if (run != runId || !isExecuting) {
                    if (error == null) releaseSticks()
                    return@enableVirtualStickMode onDone("The route has ended")
                }
                resumeInFlight = false
                if (error != null) {
                    fail("Could not take control again: $error")
                    return@enableVirtualStickMode onDone("Could not take control again: $error")
                }
                val pausedAgain = pauseDuringResume
                pauseDuringResume = null
                if (pausedAgain != null) {
                    // Paused (or disconnected) while DJI was handing over: stay paused.
                    releaseSticks()
                    callback?.onMissionPaused(pausedAgain.first, pausedAgain.second)
                    return@enableVirtualStickMode onDone(pausedAgain.first ?: "Paused again")
                }
                isPaused = false
                resetGuards()
                if (!startedReported) {
                    // Paused during take-off: this is where the route really starts.
                    startedReported = true
                    callback?.onMissionStarted(KMLMissionManager.MissionType.VIRTUAL_STICK)
                }
                callback?.onMissionResumed()
                if (controlJob?.isActive != true) startControlLoop()
                onDone(null)
            }
        }
    }

    /**
     * Ends the route: hover (if it holds the sticks), release the sticks, then
     * report it stopped and call [onReleased]. No-op (false) when no route runs.
     */
    fun stopMission(onReleased: (() -> Unit)? = null): Boolean {
        if (!isExecuting) return false
        scope.launch {
            if (!finish(Outcome.STOPPED, null, onReleased) && onReleased != null) {
                // Ended a moment ago (completed or failed): wait for that release.
                releaseWaiters?.add(onReleased) ?: onReleased()
            }
        }
        return true
    }

    /** Calls through at most once: an Expo promise settled twice throws (and crashes a release build). */
    private fun once(onDone: (String?) -> Unit): (String?) -> Unit {
        val called = AtomicBoolean(false)
        return { error -> if (called.compareAndSet(false, true)) onDone(error) }
    }

    private fun resetGuards() {
        vsLostSince = 0L
        gpsLostSince = 0L
        stuckWaypoint = -1
        stuckSince = 0L
    }

    private fun pauseNow(reason: String?, source: String) {
        Log.i(TAG, "Pausing route ($source): $reason")
        isPaused = true
        vsLostSince = 0L
        // Hover only while we still hold the sticks; under DJI's own return or
        // landing, stay out of its way.
        if (source != SOURCE_DJI_MODE && isVirtualStickEnabled() == true) sendStopCommand()
        // Hand the remote control. Only the pilot's Continue takes the sticks again.
        releaseSticks()
        callback?.onMissionPaused(reason, source)
    }

    /** The one way a route ends. False if it had already ended. */
    private fun finish(outcome: Outcome, error: String?, onReleased: (() -> Unit)? = null): Boolean {
        if (!finished.compareAndSet(false, true)) return false
        Log.i(TAG, "Route ended: $outcome${error?.let { " ($it)" } ?: ""}")
        controlJob?.cancel()
        controlJob = null
        val wasPaused = isPaused
        isExecuting = false
        isPaused = false
        resumeInFlight = false
        pauseDuringResume = null
        takingOff = false
        val cb = callback
        // A paused route already handed the sticks over: no hover then.
        if (!wasPaused && isVirtualStickEnabled() == true) sendStopCommand()
        // Report after the release, so a return to start can take the sticks straight away.
        val waiters = mutableListOf<() -> Unit>()
        onReleased?.let { waiters.add(it) }
        releaseWaiters = waiters
        ending = true
        releaseSticks {
            ending = false
            if (releaseWaiters === waiters) releaseWaiters = null
            try {
                when (outcome) {
                    Outcome.COMPLETED -> cb?.onMissionCompleted()
                    Outcome.STOPPED -> cb?.onMissionStopped()
                    Outcome.FAILED -> cb?.onMissionFailed(error ?: "The route failed")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Route end callback failed", e)
            }
            waiters.forEach {
                try { it() } catch (e: Exception) { Log.e(TAG, "Release waiter failed", e) }
            }
        }
        return true
    }

    private fun fail(message: String) {
        Log.e(TAG, "Route failed: $message")
        finish(Outcome.FAILED, message)
    }

    /** [done] gets null once DJI hands over the sticks, else the error (also after 10 s without an answer). */
    private fun enableVirtualStickMode(done: (String?) -> Unit) {
        // CRITICAL: Enable Advanced Virtual Stick Mode first (like Litchi does)
        try {
            VirtualStickManager.getInstance().setVirtualStickAdvancedModeEnabled(true)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to enable Advanced Virtual Stick Mode: ${e.message}")
        }

        val settled = AtomicBoolean(false)
        val answer = { error: String? ->
            if (settled.compareAndSet(false, true)) {
                scope.launch { done(error) }
            } else if (error == null) {
                // Handed over after we gave up: nobody flies with them, give them back.
                releaseSticks()
            }
        }
        try {
            VirtualStickManager.getInstance().enableVirtualStick(object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() { answer(null) }

                override fun onFailure(error: IDJIError) {
                    Log.w(TAG, "Failed to enable virtual stick: ${error.description()}")
                    answer(error.description() ?: error.toString())
                }
            })
        } catch (e: Exception) {
            answer(e.message ?: e.toString())
        }
        scope.launch {
            delay(TAKE_STICKS_TIMEOUT_MS)
            answer("DJI did not answer within ${TAKE_STICKS_TIMEOUT_MS / 1000} s")
        }
    }

    /** Gives the sticks back to the remote; [then] runs on the route thread once DJI answered (or after 3 s). */
    private fun releaseSticks(then: (() -> Unit)? = null) {
        val settled = AtomicBoolean(false)
        val answer = {
            if (settled.compareAndSet(false, true) && then != null) scope.launch { then() }
        }
        try {
            VirtualStickManager.getInstance().disableVirtualStick(object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() { answer() }

                override fun onFailure(error: IDJIError) {
                    Log.e(TAG, "Failed to disable virtual stick: ${error.description()}")
                    answer()
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "disableVirtualStick threw: ${e.message}")
            answer()
        }
        if (then != null) scope.launch {
            delay(RELEASE_FALLBACK_MS)
            answer()
        }
    }

    private fun startControlLoop() {
        controlJob?.cancel()
        val run = runId
        vsLostSince = 0L
        controlJob = scope.launch {
            Log.i(TAG, "Control loop started at waypoint ${currentWaypointIndex + 1}/${waypoints.size}")
            while (isActive && run == runId && isExecuting && !finished.get()) {
                if (!isPaused) {
                    try {
                        loopTick++
                        executeControlStep()
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Log.e(TAG, "Error in control step: ${e.message}", e)
                        fail("Control loop error: ${e.message}")
                        break
                    }
                }
                delay(CONTROL_LOOP_INTERVAL)
            }
        }
    }

    private fun executeControlStep() {
        // DJI's own return home or landing (low battery, the remote's RTH): stop flying the route.
        val mode = flightMode()
        if (mode != null && mode in DJI_TAKEOVER_MODES) {
            pauseNow(djiModeReason(mode), SOURCE_DJI_MODE)
            return
        }
        if (sticksLost()) {
            pauseNow("The remote took control (virtual sticks were switched off)", SOURCE_LOST_CONTROL)
            return
        }

        val currentPosition = getCurrentDronePosition()

        // Check if we have valid GPS position
        if (!gpsUsable(currentPosition)) {
            setPhase(PHASE_WAITING_FOR_GPS, null)

            // Send zero velocity to hover
            sendStopCommand()

            val now = System.currentTimeMillis()
            if (gpsLostSince == 0L) gpsLostSince = now
            // Time without GPS is not "stuck": restart that clock when GPS returns.
            stuckSince = 0L
            if (now - gpsLostSince > GPS_WAIT_LIMIT_MS) {
                pauseNow("GPS signal lost", SOURCE_GPS)
                return
            }

            // Update progress to show we're waiting for GPS
            reportProgress(
                KMLMissionManager.MissionProgress(
                    currentWaypoint = currentWaypointIndex,
                    totalWaypoints = waypoints.size,
                    progress = currentWaypointIndex.toFloat() / waypoints.size.toFloat(),
                    distanceToTarget = -1.0, // Special value to indicate GPS lock wait
                    remainingDistance = null
                )
            )
            return
        }
        gpsLostSince = 0L

        val targetWaypoint = waypoints[currentWaypointIndex]

        // Calculate distance to target
        val horizontalDistance = calculateHorizontalDistance(currentPosition, targetWaypoint)
        val verticalDistance = abs(currentPosition.altitude - targetWaypoint.altitude)

        // Check if we've arrived at the waypoint
        if (horizontalDistance <= ARRIVAL_THRESHOLD_HORIZONTAL &&
            verticalDistance <= ARRIVAL_THRESHOLD_VERTICAL) {

            Log.i(TAG, "Reached waypoint ${currentWaypointIndex + 1}/${waypoints.size}")

            // Move to next waypoint
            currentWaypointIndex++
            stuckWaypoint = -1

            // Update progress
            val progress = currentWaypointIndex.toFloat() / waypoints.size.toFloat()
            val remaining = if (currentWaypointIndex < waypoints.size) {
                calculateHorizontalDistance(currentPosition, waypoints[currentWaypointIndex]) + routeAfter[currentWaypointIndex]
            } else 0.0
            reportProgress(
                KMLMissionManager.MissionProgress(
                    currentWaypoint = currentWaypointIndex,
                    totalWaypoints = waypoints.size,
                    progress = progress,
                    distanceToTarget = 0.0,
                    remainingDistance = remaining
                )
            )

            if (currentWaypointIndex >= waypoints.size) {
                finish(Outcome.COMPLETED, null)
            }
            return
        }

        if (isStuck(sqrt(horizontalDistance * horizontalDistance + verticalDistance * verticalDistance))) {
            pauseNow("Not getting closer to waypoint ${currentWaypointIndex + 1}", SOURCE_STUCK)
            return
        }

        // Climb first: while the leg is well above the drone (straight after
        // take-off), go straight up and only then move toward the waypoint.
        val climbing = climbFirst && targetWaypoint.altitude - currentPosition.altitude > ARRIVAL_THRESHOLD_VERTICAL
        setPhase(if (climbing) PHASE_CLIMBING else PHASE_FLYING, if (climbing) targetWaypoint.altitude else null)

        // Calculate control inputs using Litchi-style navigation
        val velocityCommand = calculateVelocityCommand(currentPosition, targetWaypoint, horizontalDistance, climbing)

        // Send virtual stick command
        sendVirtualStickCommand(velocityCommand)

        // Update progress
        val progress = (currentWaypointIndex.toFloat() +
                       (1.0f - (horizontalDistance.toFloat() / 100.0f).coerceIn(0.0f, 1.0f))) / waypoints.size.toFloat()

        reportProgress(
            KMLMissionManager.MissionProgress(
                currentWaypoint = currentWaypointIndex,
                totalWaypoints = waypoints.size,
                progress = progress,
                distanceToTarget = horizontalDistance,
                remainingDistance = horizontalDistance + routeAfter[currentWaypointIndex]
            )
        )
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

    /** No 1 m of progress toward the current waypoint for STUCK_TIMEOUT_MS. */
    private fun isStuck(distance: Double): Boolean {
        val now = System.currentTimeMillis()
        if (stuckWaypoint != currentWaypointIndex || stuckSince == 0L) {
            stuckWaypoint = currentWaypointIndex
            stuckBest = distance
            stuckSince = now
            return false
        }
        if (distance <= stuckBest - STUCK_MIN_GAIN) {
            stuckBest = distance
            stuckSince = now
            return false
        }
        return now - stuckSince > STUCK_TIMEOUT_MS
    }

    /** A position, and a GPS signal level of 2 or better when DJI reports one. */
    private fun gpsUsable(position: DronePosition): Boolean {
        if (position.latitude == 0.0 && position.longitude == 0.0) return false
        val level = try {
            FlightControllerKey.KeyGPSSignalLevel.create().get()
        } catch (e: Exception) {
            null
        }
        // UNKNOWN / no reading: rely on the position alone.
        return level != GPSSignalLevel.LEVEL_0 && level != GPSSignalLevel.LEVEL_1 && level != GPSSignalLevel.LEVEL_NONE
    }

    /** On a waypoint change at once, otherwise at most once a second; sent from this thread. */
    private fun reportProgress(progress: KMLMissionManager.MissionProgress) {
        if (progress.currentWaypoint == lastProgressWaypoint && loopTick - lastProgressTick < PROGRESS_EVERY_TICKS) return
        lastProgressWaypoint = progress.currentWaypoint
        lastProgressTick = loopTick
        callback?.onMissionProgress(progress)
    }

    private fun setPhase(newPhase: String, targetAltitude: Double?) {
        if (newPhase == phase && targetAltitude == phaseTarget) return
        if (newPhase != phase) Log.i(TAG, "Phase: $newPhase${targetAltitude?.let { " (to ${"%.1f".format(it)} m)" } ?: ""}")
        phase = newPhase
        phaseTarget = targetAltitude
        callback?.onMissionPhase(newPhase, targetAltitude)
    }

    private fun flightMode(): FlightMode? = try {
        FlightControllerKey.KeyFlightMode.create().get()
    } catch (e: Exception) {
        null
    }

    private fun isFlyingNow(): Boolean = try {
        FlightControllerKey.KeyIsFlying.create().get(false) == true
    } catch (e: Exception) {
        false
    }

    private fun djiModeReason(mode: FlightMode): String = when (mode) {
        FlightMode.GO_HOME -> "DJI is flying home on its own"
        FlightMode.FORCE_LANDING -> "DJI is force-landing the drone"
        else -> "DJI is landing the drone"
    }

    /** Latitude/longitude 0,0 when there is no GPS position (the step then waits for GPS). */
    private fun getCurrentDronePosition(): DronePosition {
        val location: LocationCoordinate3D? = try {
            FlightControllerKey.KeyAircraftLocation3D.create().get()
        } catch (e: Exception) {
            null
        }
        // Altitude separately (barometric, relative to take-off; more reliable than the GPS one).
        val altitude = try {
            FlightControllerKey.KeyAltitude.create().get()?.toFloat() ?: 0.0f
        } catch (e: Exception) {
            location?.altitude?.toFloat() ?: 0.0f
        }
        // Compass heading (using attitude yaw)
        val heading = try {
            FlightControllerKey.KeyAircraftAttitude.create().get()?.yaw?.toFloat() ?: 0.0f
        } catch (e: Exception) {
            0.0f
        }
        val lat = location?.latitude
        val lon = location?.longitude
        return if (lat != null && lon != null && lat != 0.0 && lon != 0.0) {
            DronePosition(latitude = lat, longitude = lon, altitude = altitude, heading = heading)
        } else {
            DronePosition(latitude = 0.0, longitude = 0.0, altitude = altitude, heading = heading)
        }
    }

    private fun calculateHorizontalDistance(current: DronePosition, target: KMLWaypoint): Double {
        // Simple distance calculation using math (LocationUtil might not have the method we need)
        val lat1Rad = Math.toRadians(current.latitude)
        val lat2Rad = Math.toRadians(target.latitude)
        val deltaLatRad = Math.toRadians(target.latitude - current.latitude)
        val deltaLonRad = Math.toRadians(target.longitude - current.longitude)

        val a = sin(deltaLatRad / 2) * sin(deltaLatRad / 2) +
                cos(lat1Rad) * cos(lat2Rad) *
                sin(deltaLonRad / 2) * sin(deltaLonRad / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))

        return 6371000 * c // Earth radius in meters
    }

    private fun distanceBetween(a: KMLWaypoint, b: KMLWaypoint): Double {
        val dLat = Math.toRadians(b.latitude - a.latitude)
        val dLon = Math.toRadians(b.longitude - a.longitude)
        val h = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(a.latitude)) * cos(Math.toRadians(b.latitude)) * sin(dLon / 2) * sin(dLon / 2)
        return 6371000 * 2 * atan2(sqrt(h), sqrt(1 - h))
    }

    private fun calculateBearing(current: DronePosition, target: KMLWaypoint): Double {
        val lat1Rad = Math.toRadians(current.latitude)
        val lat2Rad = Math.toRadians(target.latitude)
        val deltaLonRad = Math.toRadians(target.longitude - current.longitude)

        val y = sin(deltaLonRad) * cos(lat2Rad)
        val x = cos(lat1Rad) * sin(lat2Rad) - sin(lat1Rad) * cos(lat2Rad) * cos(deltaLonRad)

        var bearing = Math.toDegrees(atan2(y, x))
        bearing = (bearing + 360) % 360 // Normalize to 0-360 degrees

        return bearing
    }
    
    private fun calculateBearingToPoint(fromLat: Double, fromLon: Double, toLat: Double, toLon: Double): Double {
        val lat1Rad = Math.toRadians(fromLat)
        val lat2Rad = Math.toRadians(toLat)
        val deltaLonRad = Math.toRadians(toLon - fromLon)

        val y = sin(deltaLonRad) * cos(lat2Rad)
        val x = cos(lat1Rad) * sin(lat2Rad) - sin(lat1Rad) * cos(lat2Rad) * cos(deltaLonRad)

        var bearing = Math.toDegrees(atan2(y, x))
        bearing = (bearing + 360) % 360 // Normalize to 0-360 degrees

        return bearing
    }

    private fun calculateVelocityCommand(
        current: DronePosition, 
        target: KMLWaypoint, 
        distance: Double,
        /** Climb first: straight up, no horizontal movement, until the leg's altitude is close. */
        climbing: Boolean
    ): VirtualStickFlightControlParam {
        
        // Calculate bearing to target (in degrees, 0-360)
        val bearing = calculateBearing(current, target)
        
        // Calculate speed based on distance (slow down when approaching).
        // Uses the MAX_HORIZONTAL_SPEED ceiling (1.5 m/s) so inspection stays gentle.
        val maxSpeed = MAX_HORIZONTAL_SPEED
        val speedFactor = if (distance > DECELERATION_DISTANCE) {
            1.0
        } else {
            (distance / DECELERATION_DISTANCE).coerceIn(0.1, 1.0)
        }
        val targetSpeed = maxSpeed * speedFactor
        
        // Convert bearing to velocity components
        // TESTING: Try different DJI coordinate system mapping
        // Based on user feedback, original mapping causes "left and up" movement
        val bearingRad = Math.toRadians(bearing)
        val velocityNorth = targetSpeed * cos(bearingRad)
        val velocityEast = targetSpeed * sin(bearingRad)
        
        // Apply velocity limits with less aggressive scaling for better performance
        val distanceScale = if (distance < 3.0) {
            // For very small distances, scale down moderately
            (distance / 3.0).coerceIn(0.3, 1.0)
        } else {
            1.0
        }
        
        // EXPERIMENTAL: Try reversing the pitch/roll mapping based on user feedback
        // Original: pitch = velocityNorth, roll = velocityEast (caused "left and up" movement)
        // Testing: Swap pitch/roll or negate values
        
        // Option 1: Swap pitch and roll
        val pitch = (velocityEast * distanceScale).coerceIn(-maxSpeed, maxSpeed)
        val roll = (velocityNorth * distanceScale).coerceIn(-maxSpeed, maxSpeed)
        
        // Option 2: Negate values (uncomment if Option 1 doesn't work)
        // val pitch = -(velocityNorth * distanceScale).coerceIn(-maxSpeed, maxSpeed)
        // val roll = -(velocityEast * distanceScale).coerceIn(-maxSpeed, maxSpeed)
        
        // Safety check: If commands are very small, set to zero to prevent jitter
        val finalPitch = if (climbing || abs(pitch) < 0.1) 0.0 else pitch
        val finalRoll = if (climbing || abs(roll) < 0.1) 0.0 else roll
        
        // Calculate vertical velocity with normal responsive control
        val altitudeDifference = target.altitude - current.altitude
        val verticalVelocity = when {
            abs(altitudeDifference) < ARRIVAL_THRESHOLD_VERTICAL -> 0.0
            altitudeDifference > 5.0 -> 3.0 // Fast climb if more than 5m below
            altitudeDifference > 3.0 -> 2.0 // Moderate climb if more than 3m below
            altitudeDifference > 1.0 -> 1.0 // Normal climb if more than 1m below
            altitudeDifference > 0 -> 0.5 // Gentle climb if slightly below
            altitudeDifference < -5.0 -> -3.0 // Fast descent if more than 5m above
            altitudeDifference < -3.0 -> -2.0 // Moderate descent if more than 3m above
            altitudeDifference < -1.0 -> -1.0 // Normal descent if more than 1m above
            else -> -0.5 // Gentle descent if slightly above
        }
        
        // POI MODE: face the center point of the mission path (precomputed per route)
        // This assumes a circular/orbital path where drone should always face the center
        // Calculate bearing from current position to the center point (POI)
        val bearingToPOI = calculateBearingToPoint(
            current.latitude, current.longitude,
            centerLat, centerLon
        )
        
        // Calculate yaw adjustment to face the POI (center of path)
        val currentHeading = current.heading.toDouble()
        val headingDifference = (bearingToPOI - currentHeading + 360) % 360
        
        // Convert to -180 to 180 range for shortest rotation
        val yawAdjustment = if (headingDifference > 180) {
            headingDifference - 360
        } else {
            headingDifference
        }
        
        // Apply smooth yaw rotation with max 30 deg/s. Without faceCenter the
        // heading is held: turning while the camera shoots smears the photos.
        val yaw = when {
            !faceCenter -> 0.0
            abs(yawAdjustment) < 3.0 -> 0.0 // Dead zone to prevent jitter
            abs(yawAdjustment) > 30.0 -> yawAdjustment.coerceIn(-30.0, 30.0) // Fast rotation
            else -> yawAdjustment * 0.5 // Slow rotation when close to target heading
        }
        
        val command = VirtualStickFlightControlParam()
        command.pitch = finalPitch
        command.roll = finalRoll
        command.yaw = yaw
        command.verticalThrottle = verticalVelocity
        command.rollPitchControlMode = RollPitchControlMode.VELOCITY
        command.yawControlMode = YawControlMode.ANGULAR_VELOCITY
        command.verticalControlMode = VerticalControlMode.VELOCITY
        command.rollPitchCoordinateSystem = FlightCoordinateSystem.GROUND
        
        return command
    }

    private fun sendVirtualStickCommand(command: VirtualStickFlightControlParam) {
        VirtualStickManager.getInstance().sendVirtualStickAdvancedParam(command)
    }

    private fun sendStopCommand() {
        val stopCommand = VirtualStickFlightControlParam()
        stopCommand.pitch = 0.0
        stopCommand.roll = 0.0
        stopCommand.yaw = 0.0
        stopCommand.verticalThrottle = 0.0
        stopCommand.rollPitchControlMode = RollPitchControlMode.VELOCITY
        stopCommand.yawControlMode = YawControlMode.ANGULAR_VELOCITY
        stopCommand.verticalControlMode = VerticalControlMode.VELOCITY
        stopCommand.rollPitchCoordinateSystem = FlightCoordinateSystem.GROUND
        
        // Send stop command multiple times to ensure it's received
        try {
            repeat(3) {
                sendVirtualStickCommand(stopCommand)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Stop command failed: ${e.message}")
        }
    }

    private fun checkFlightStatusAndProceed(run: Int) {
        // KeyIsFlying, not motors-on: spinning motors on the ground still need a take-off.
        val flying = isFlyingNow()
        Log.i(TAG, "Flying: $flying (mode ${flightMode()})")
        if (!flying) initiateAutomaticTakeoff(run) else proceedWithMissionStart(run)
    }
    
    private fun initiateAutomaticTakeoff(run: Int) {
        Log.i(TAG, "Taking off")
        takingOff = true
        setPhase(PHASE_TAKING_OFF, null)

        try {
            FlightControllerKey.KeyStartTakeoff.create().action(
                onSuccess = { _: EmptyMsg ->
                    scope.launch {
                        if (run != runId || !isExecuting) return@launch
                        controlJob = launch { waitForTakeoff(run) }
                    }
                },
                onFailure = { error: IDJIError ->
                    Log.w(TAG, "Takeoff refused: $error")
                    scope.launch {
                        if (run != runId || !isExecuting) return@launch
                        // DJI refuses a take-off when it is already airborne; that is fine.
                        if (isFlyingNow()) proceedWithMissionStart(run)
                        else fail("Automatic takeoff failed: ${error.description() ?: error.toString()}")
                    }
                }
            )
        } catch (e: Exception) {
            fail("Automatic takeoff failed: ${e.message}")
        }
    }

    /** Waits until DJI's take-off is over: airborne and no longer in AUTO_TAKE_OFF. */
    private suspend fun waitForTakeoff(run: Int) {
        val deadline = System.currentTimeMillis() + TAKEOFF_TIMEOUT_MS
        while (run == runId && isExecuting) {
            val mode = flightMode()
            if (mode != null && mode in DJI_TAKEOVER_MODES) {
                // The pilot (or DJI) chose to land or go home instead: let it.
                return fail("${djiModeReason(mode)} during take-off; the route did not start")
            }
            if (isFlyingNow() && mode != FlightMode.AUTO_TAKE_OFF) {
                Log.i(TAG, "Take-off finished")
                return proceedWithMissionStart(run)
            }
            if (System.currentTimeMillis() > deadline) return fail("Take-off did not finish")
            delay(TAKEOFF_POLL_MS)
        }
    }
    
    private fun proceedWithMissionStart(run: Int) {
        if (run != runId || !isExecuting) return
        takingOff = false
        // Paused (or stopped) during take-off: the pilot's Continue takes the sticks.
        if (isPaused) return
        val mode = flightMode()
        if (mode != null && mode in DJI_TAKEOVER_MODES) {
            return fail("${djiModeReason(mode)}; the route did not start")
        }
        // Enable virtual stick mode and start the mission
        enableVirtualStickMode { error ->
            if (run != runId || !isExecuting) {
                // Ended while DJI was handing over: nobody flies with these sticks.
                if (error == null) releaseSticks()
                return@enableVirtualStickMode
            }
            if (error != null) {
                return@enableVirtualStickMode fail("Could not take control of the drone: $error")
            }
            if (isPaused) {
                // Paused while DJI was handing over: stay paused, remote in control.
                releaseSticks()
                return@enableVirtualStickMode
            }
            startedReported = true
            callback?.onMissionStarted(KMLMissionManager.MissionType.VIRTUAL_STICK)
            startControlLoop()
        }
    }
}
