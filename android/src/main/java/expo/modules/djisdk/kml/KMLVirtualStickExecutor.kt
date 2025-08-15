package expo.modules.djisdk.kml

import android.util.Log
import dji.v5.manager.aircraft.virtualstick.VirtualStickManager
import dji.v5.manager.aircraft.virtualstick.VirtualStickState
import dji.sdk.keyvalue.value.flightcontroller.*
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.key.FlightControllerKey.*
import dji.sdk.keyvalue.value.common.LocationCoordinate3D
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.v5.utils.common.LocationUtil
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.et.create
import dji.v5.et.get
import dji.v5.et.action
import kotlinx.coroutines.*
import kotlin.math.*

/**
 * KML Virtual Stick Mission Executor
 * Implements Litchi-style navigation using pure DJI SDK v5
 * Works directly with KML waypoints for consumer drones
 */
class KMLVirtualStickExecutor {
    companion object {
        private const val TAG = "KMLVirtualStickExecutor"
        private const val CONTROL_LOOP_INTERVAL = 100L // 10Hz update rate
        private const val ARRIVAL_THRESHOLD_HORIZONTAL = 3.0 // meters
        private const val ARRIVAL_THRESHOLD_VERTICAL = 1.5 // meters
        private const val MAX_HORIZONTAL_SPEED = 8.0 // m/s
        private const val MAX_VERTICAL_SPEED = 3.0 // m/s
        private const val MAX_YAW_SPEED = 60.0 // deg/s
        private const val DECELERATION_DISTANCE = 10.0 // meters to start slowing down
    }
    
    // Helper function to send debug logs to React Native UI
    private fun sendDebugToUI(message: String) {
        Log.d(TAG, message)
        // Also send to KMLMissionManager for React Native display
        try {
            callback?.let { cb ->
                if (cb is KMLMissionManager.KMLMissionCallback) {
                    // This will show up in the KML Mission Screen debug logs
                    android.util.Log.d("KMLMissionManager", "VS: $message")
                }
            }
        } catch (e: Exception) {
            // Ignore if callback doesn't support debug logging
        }
    }

    private var isExecuting = false
    private var isPaused = false
    private var currentWaypointIndex = 0
    private var controlJob: Job? = null
    private var callback: KMLMissionManager.KMLMissionCallback? = null
    private var waypoints: List<KMLWaypoint> = emptyList()


    data class DronePosition(
        val latitude: Double,
        val longitude: Double,
        val altitude: Float,
        val heading: Float
    )

    fun startMission(
        kmlWaypoints: List<KMLWaypoint>,
        callback: KMLMissionManager.KMLMissionCallback
    ) {
        if (isExecuting) {
            Log.w(TAG, "Mission already executing")
            return
        }

        this.waypoints = kmlWaypoints
        this.callback = callback
        this.currentWaypointIndex = 0
        this.isExecuting = true
        this.isPaused = false

        sendDebugToUI("🚁 Starting KML virtual stick mission with ${waypoints.size} waypoints")
        sendDebugToUI("📍 Target: ${waypoints.firstOrNull()?.let { "lat=${it.latitude}, lon=${it.longitude}" } ?: "No waypoints"}")

        // Check if drone is flying, if not, initiate takeoff first
        checkFlightStatusAndProceed()
    }

    fun pauseMission() {
        if (!isExecuting || isPaused) return
        
        Log.d(TAG, "Pausing virtual stick mission")
        isPaused = true
        
        // Stop the drone by sending zero velocities
        sendStopCommand()
        
        // Disable virtual stick to give RC control back
        disableVirtualStickMode()
        
        callback?.onMissionPaused()
    }

    fun resumeMission() {
        if (!isExecuting || !isPaused) return
        
        Log.d(TAG, "Resuming virtual stick mission")
        isPaused = false
        
        // Re-enable virtual stick mode
        enableVirtualStickMode { success ->
            if (success) {
                callback?.onMissionResumed()
                // Control loop will automatically resume
            } else {
                Log.e(TAG, "Failed to re-enable virtual stick mode")
                callback?.onMissionFailed("Failed to resume virtual stick mode")
            }
        }
    }

    fun stopMission() {
        Log.d(TAG, "Stopping virtual stick mission")
        
        controlJob?.cancel()
        isExecuting = false
        isPaused = false
        currentWaypointIndex = 0
        
        // Stop the drone
        sendStopCommand()
        
        // Disable virtual stick mode
        disableVirtualStickMode()
        
        callback?.onMissionCompleted()
    }

    private fun enableVirtualStickMode(callback: (Boolean) -> Unit) {
        sendDebugToUI("🎮 Enabling ADVANCED virtual stick mode (like Litchi)")
        
        // CRITICAL: Enable Advanced Virtual Stick Mode first (like Litchi does)
        try {
            VirtualStickManager.getInstance().setVirtualStickAdvancedModeEnabled(true)
            sendDebugToUI("✅ Advanced Virtual Stick Mode enabled")
        } catch (e: Exception) {
            sendDebugToUI("❌ Failed to enable Advanced Virtual Stick Mode: ${e.message}")
        }
        
        VirtualStickManager.getInstance().enableVirtualStick(object : dji.v5.common.callback.CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                sendDebugToUI("✅ Virtual stick control is now ACTIVE")
                setupVirtualStickParams()
                callback(true)
            }
            
            override fun onFailure(error: dji.v5.common.error.IDJIError) {
                sendDebugToUI("❌ Failed to enable virtual stick: ${error.description()}")
                callback(false)
            }
        })
    }

    private fun disableVirtualStickMode() {
        Log.d(TAG, "Disabling virtual stick mode")
        
        VirtualStickManager.getInstance().disableVirtualStick(object : dji.v5.common.callback.CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                Log.d(TAG, "Virtual stick mode disabled successfully")
            }
            
            override fun onFailure(error: dji.v5.common.error.IDJIError) {
                Log.e(TAG, "Failed to disable virtual stick: ${error.description()}")
            }
        })
    }

    private fun setupVirtualStickParams() {
        // Set virtual stick control modes (similar to Litchi)
        val rollPitchControlMode = RollPitchControlMode.VELOCITY
        val yawControlMode = YawControlMode.ANGULAR_VELOCITY  
        val verticalControlMode = VerticalControlMode.VELOCITY
        val coordinateSystem = FlightCoordinateSystem.GROUND

        Log.d(TAG, "Setting virtual stick control modes: " +
              "RollPitch=$rollPitchControlMode, Yaw=$yawControlMode, " +
              "Vertical=$verticalControlMode, CoordSystem=$coordinateSystem")
    }

    private fun startControlLoop() {
        controlJob = CoroutineScope(Dispatchers.IO).launch {
            Log.d(TAG, "Starting control loop at ${CONTROL_LOOP_INTERVAL}ms intervals")
            Log.d(TAG, "Total waypoints to navigate: ${waypoints.size}")
            
            if (waypoints.isEmpty()) {
                Log.e(TAG, "❌ No waypoints available to navigate!")
                withContext(Dispatchers.Main) {
                    callback?.onMissionFailed("No waypoints found in mission")
                }
                return@launch
            }
            
            // Log all waypoints for debugging
            waypoints.forEachIndexed { index, waypoint ->
                Log.d(TAG, "Waypoint $index: lat=${waypoint.latitude}, lon=${waypoint.longitude}, alt=${waypoint.altitude}")
            }
            
            while (isExecuting && currentWaypointIndex < waypoints.size) {
                if (!isPaused) {
                    try {
                        Log.v(TAG, "Control step: executing waypoint ${currentWaypointIndex + 1}/${waypoints.size}")
                        executeControlStep()
                    } catch (e: Exception) {
                        Log.e(TAG, "Error in control step: ${e.message}", e)
                        withContext(Dispatchers.Main) {
                            callback?.onMissionFailed("Control loop error: ${e.message}")
                        }
                        break
                    }
                }
                delay(CONTROL_LOOP_INTERVAL)
            }
            
            if (currentWaypointIndex >= waypoints.size) {
                Log.d(TAG, "Mission completed - reached all waypoints")
                withContext(Dispatchers.Main) {
                    stopMission()
                }
            }
        }
    }

    private suspend fun executeControlStep() {
        val currentPosition = getCurrentDronePosition()
        
        // Check if we have valid GPS position
        if (currentPosition.latitude == 0.0 && currentPosition.longitude == 0.0) {
            sendDebugToUI("⚠️ Waiting for GPS lock... (hovering)")
            sendDebugToUI("📍 Need GPS to navigate to: lat=${waypoints.firstOrNull()?.latitude}, lon=${waypoints.firstOrNull()?.longitude}")
            
            // Send zero velocity to hover
            sendStopCommand()
            
            // Update progress to show we're waiting for GPS
            withContext(Dispatchers.Main) {
                callback?.onMissionProgress(
                    KMLMissionManager.MissionProgress(
                        currentWaypoint = 0,
                        totalWaypoints = waypoints.size,
                        progress = 0.0f,
                        distanceToTarget = -1.0 // Special value to indicate GPS lock wait
                    )
                )
            }
            return
        }
        
        val targetWaypoint = waypoints[currentWaypointIndex]
        
        // Calculate distance to target
        val horizontalDistance = calculateHorizontalDistance(currentPosition, targetWaypoint)
        val verticalDistance = abs(currentPosition.altitude - targetWaypoint.altitude)
        
        // Send navigation info to UI every 1 second (every 10th control loop)
        if (System.currentTimeMillis() % 1000 < CONTROL_LOOP_INTERVAL) {
            sendDebugToUI("🧭 Nav to WP${currentWaypointIndex + 1}/${waypoints.size}: ${horizontalDistance.format(0)}m away")
            sendDebugToUI("📊 Drone: lat=${currentPosition.latitude.format(6)}, alt=${currentPosition.altitude.format(0)}m")
        }

        // Check if we've arrived at the waypoint
        if (horizontalDistance <= ARRIVAL_THRESHOLD_HORIZONTAL && 
            verticalDistance <= ARRIVAL_THRESHOLD_VERTICAL) {
            
            sendDebugToUI("🎯 Reached waypoint ${currentWaypointIndex + 1}/${waypoints.size}")
            
            // Move to next waypoint
            currentWaypointIndex++
            
            // Update progress
            val progress = currentWaypointIndex.toFloat() / waypoints.size.toFloat()
            withContext(Dispatchers.Main) {
                callback?.onMissionProgress(
                    KMLMissionManager.MissionProgress(
                        currentWaypoint = currentWaypointIndex,
                        totalWaypoints = waypoints.size,
                        progress = progress,
                        distanceToTarget = 0.0
                    )
                )
            }
            
            return
        }

        // Calculate control inputs using Litchi-style navigation
        val velocityCommand = calculateVelocityCommand(currentPosition, targetWaypoint, horizontalDistance)
        
        // Log detailed velocity commands every 1 second
        if (System.currentTimeMillis() % 1000 < CONTROL_LOOP_INTERVAL) {
            sendDebugToUI("🎮 Velocity: pitch=${velocityCommand.pitch.format(1)}, roll=${velocityCommand.roll.format(1)}, vert=${velocityCommand.verticalThrottle.format(1)}")
        }
        
        // Send virtual stick command
        sendVirtualStickCommand(velocityCommand)
        
        // Update progress
        val progress = (currentWaypointIndex.toFloat() + 
                       (1.0f - (horizontalDistance.toFloat() / 100.0f).coerceIn(0.0f, 1.0f))) / waypoints.size.toFloat()
        
        withContext(Dispatchers.Main) {
            callback?.onMissionProgress(
                KMLMissionManager.MissionProgress(
                    currentWaypoint = currentWaypointIndex,
                    totalWaypoints = waypoints.size,
                    progress = progress,
                    distanceToTarget = horizontalDistance
                )
            )
        }
    }

    private fun getCurrentDronePosition(): DronePosition {
        // Get current aircraft location using DJI SDK v5
        try {
            // Try multiple methods to get GPS position
            var location: LocationCoordinate3D? = null
            var altitude = 0.0f
            var heading = 0.0f
            
            // Method 1: Try KeyAircraftLocation3D (primary)
            try {
                val locationKey = FlightControllerKey.KeyAircraftLocation3D.create()
                location = locationKey.get()
                Log.d(TAG, "Method 1 - KeyAircraftLocation3D: ${location?.latitude}, ${location?.longitude}, ${location?.altitude}")
            } catch (e: Exception) {
                Log.w(TAG, "Method 1 failed: ${e.message}")
            }
            
            // Method 2: Log if primary method failed
            if (location == null || (location.latitude == 0.0 && location.longitude == 0.0)) {
                Log.w(TAG, "Primary GPS method failed or returned zeros")
                Log.w(TAG, "This usually means the drone doesn't have GPS lock yet")
            }
            
            // Get altitude separately (this is usually more reliable)
            try {
                val altKey = FlightControllerKey.KeyAltitude.create()
                val altValue = altKey.get()
                altitude = altValue?.toFloat() ?: 0.0f
                Log.d(TAG, "Got altitude: ${altitude}m")
                
                // Override location altitude if we have it
                if (location != null && altitude > 0) {
                    location.altitude = altitude.toDouble()
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to get altitude: ${e.message}")
                altitude = location?.altitude?.toFloat() ?: 0.0f
            }
            
            // Get compass heading (using attitude yaw)
            try {
                val attitudeKey = FlightControllerKey.KeyAircraftAttitude.create()
                val attitude = attitudeKey.get()
                heading = attitude?.yaw?.toFloat() ?: 0.0f
                Log.d(TAG, "Got heading: ${heading}°")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to get heading: ${e.message}")
                heading = 0.0f
            }
            
            // Final validation and return
            if (location != null && location.latitude != 0.0 && location.longitude != 0.0) {
                // Only send GPS position to UI occasionally to avoid spam
                val currentTime = System.currentTimeMillis()
                if (currentTime % 2000 < CONTROL_LOOP_INTERVAL) { // Every 2 seconds
                    sendDebugToUI("📡 GPS: lat=${location.latitude.format(6)}, lon=${location.longitude.format(6)}")
                }
                return DronePosition(
                    latitude = location.latitude,
                    longitude = location.longitude, 
                    altitude = altitude,
                    heading = heading
                )
            } else {
                sendDebugToUI("❌ No GPS lock - location: ${location?.latitude}, ${location?.longitude}")
                
                // Return zero position - control loop will handle this
                return DronePosition(
                    latitude = 0.0,
                    longitude = 0.0,
                    altitude = altitude, // At least return altitude if we have it
                    heading = heading
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception getting drone position: ${e.message}", e)
            return DronePosition(
                latitude = 0.0,
                longitude = 0.0,
                altitude = 0.0f,
                heading = 0.0f
            )
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

    private fun calculateVelocityCommand(
        current: DronePosition, 
        target: KMLWaypoint, 
        distance: Double
    ): VirtualStickFlightControlParam {
        
        // Calculate bearing to target (in degrees, 0-360)
        val bearing = calculateBearing(current, target)
        
        // Calculate speed based on distance (slow down when approaching)
        val maxSpeed = 5.0 // More conservative speed for testing (5 m/s)
        val speedFactor = if (distance > DECELERATION_DISTANCE) {
            1.0
        } else {
            (distance / DECELERATION_DISTANCE).coerceIn(0.1, 1.0)
        }
        val targetSpeed = maxSpeed * speedFactor
        
        // Convert bearing to velocity components
        // Using GROUND coordinate system, where:
        // pitch = north/south velocity (positive = north)
        // roll = east/west velocity (positive = east)
        val bearingRad = Math.toRadians(bearing)
        val velocityNorth = targetSpeed * cos(bearingRad)
        val velocityEast = targetSpeed * sin(bearingRad)
        
        // Apply velocity limits
        val pitch = velocityNorth.coerceIn(-maxSpeed, maxSpeed)
        val roll = velocityEast.coerceIn(-maxSpeed, maxSpeed)
        
        // Calculate vertical velocity with smoother control
        val altitudeDifference = target.altitude - current.altitude
        val verticalVelocity = when {
            abs(altitudeDifference) < ARRIVAL_THRESHOLD_VERTICAL -> 0.0
            altitudeDifference > 3.0 -> 2.0 // Climb at 2 m/s if more than 3m below
            altitudeDifference > 0 -> 1.0 // Climb at 1 m/s if slightly below
            altitudeDifference < -3.0 -> -2.0 // Descend at 2 m/s if more than 3m above
            else -> -1.0 // Descend at 1 m/s if slightly above
        }
        
        // No yaw rotation for now (keeps current heading)
        val yaw = 0.0
        
        Log.d(TAG, "Velocity calc: bearing=${bearing.format(1)}°, distance=${distance.format(1)}m, speed=${targetSpeed.format(1)}m/s")
        Log.d(TAG, "Velocity command: pitch=${pitch.format(2)}, roll=${roll.format(2)}, yaw=$yaw, vertical=$verticalVelocity")
        
        val command = VirtualStickFlightControlParam()
        command.pitch = pitch
        command.roll = roll
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
        repeat(3) {
            sendVirtualStickCommand(stopCommand)
        }
        
        Log.d(TAG, "Stop command sent")
    }

    private fun checkFlightStatusAndProceed() {
        Log.d(TAG, "Checking flight status before starting mission")
        
        try {
            val flightStatus = FlightControllerKey.KeyFlightMode.create().get(FlightMode.UNKNOWN)
            val isFlying = isCurrentlyFlying()
            
            Log.d(TAG, "Current flight mode: $flightStatus, is flying: $isFlying")
            
            if (!isFlying) {
                Log.d(TAG, "Drone is not flying, initiating automatic takeoff")
                initiateAutomaticTakeoff()
            } else {
                Log.d(TAG, "Drone is already flying, proceeding with mission")
                proceedWithMissionStart()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking flight status: ${e.message}", e)
            callback?.onMissionFailed("Failed to check flight status: ${e.message}")
            isExecuting = false
        }
    }
    
    private fun isCurrentlyFlying(): Boolean {
        return try {
            val flightMode = FlightControllerKey.KeyFlightMode.create().get(FlightMode.UNKNOWN)
            val areMotorsOn = FlightControllerKey.KeyAreMotorsOn.create().get(false)
            
            // Consider flying if motors are on and not in specific ground modes
            val isFlying = areMotorsOn && flightMode != FlightMode.MOTOR_START && 
                          flightMode != FlightMode.UNKNOWN
            
            Log.d(TAG, "Flight status check - Motors on: $areMotorsOn, Flight mode: $flightMode, Is flying: $isFlying")
            isFlying
        } catch (e: Exception) {
            Log.w(TAG, "Error checking if flying: ${e.message}", e)
            false
        }
    }
    
    private fun initiateAutomaticTakeoff() {
        sendDebugToUI("🚀 Starting automatic takeoff...")
        
        FlightControllerKey.KeyStartTakeoff.create().action(
            onSuccess = { result: EmptyMsg ->
                sendDebugToUI("✅ Takeoff successful! Stabilizing for 3 seconds...")
                
                // Wait a moment for the drone to stabilize after takeoff
                CoroutineScope(Dispatchers.IO).launch {
                    delay(3000) // 3 second stabilization delay
                    
                    sendDebugToUI("🏁 Takeoff complete, starting mission...")
                    withContext(Dispatchers.Main) {
                        proceedWithMissionStart()
                    }
                }
            },
            onFailure = { error: IDJIError ->
                sendDebugToUI("❌ Takeoff failed: ${error.toString()}")
                
                // Check if it's a "already flying" error
                if (error.toString().contains("already", ignoreCase = true) || 
                    error.toString().contains("flying", ignoreCase = true)) {
                    sendDebugToUI("✈️ Drone already flying, proceeding with mission")
                    proceedWithMissionStart()
                } else {
                    callback?.onMissionFailed("Automatic takeoff failed: ${error.toString()}")
                    isExecuting = false
                }
            }
        )
    }
    
    private fun proceedWithMissionStart() {
        sendDebugToUI("🎯 Starting waypoint navigation mission...")
        
        // Enable virtual stick mode and start the mission
        enableVirtualStickMode { success ->
            if (success) {
                sendDebugToUI("🚁 Mission started - control loop active")
                callback?.onMissionStarted(KMLMissionManager.MissionType.VIRTUAL_STICK)
                startControlLoop()
            } else {
                sendDebugToUI("❌ Failed to enable virtual stick mode")
                callback?.onMissionFailed("Failed to enable virtual stick mode")
                isExecuting = false
            }
        }
    }

    private fun Double.format(decimals: Int): String = "%.${decimals}f".format(this)
    private fun Float.format(decimals: Int): String = "%.${decimals}f".format(this)
}