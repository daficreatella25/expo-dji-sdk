package expo.modules.djisdk.kml

import android.util.Log
import android.os.Environment
import android.content.Context
import android.net.Uri
import expo.modules.kotlin.Promise
import dji.v5.manager.aircraft.waypoint3.WaypointMissionManager
import dji.v5.utils.common.ContextUtil
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.v5.et.create
import dji.v5.et.get
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

data class MissionConfig(
    val speed: Float = 5.0f,
    val maxSpeed: Float = 10.0f,
    val enableTakePhoto: Boolean = false,
    val enableStartRecording: Boolean = false,
    /** Turn the nose toward the middle of the route (orbits/inspection). Off: hold heading, sharper photos. */
    val faceCenter: Boolean = false,
    /** Reach each leg's altitude before moving sideways when it is above the drone (take-off). */
    val climbFirst: Boolean = true,
    /** After the last waypoint, fly back to the take-off point (ReturnToStartController). */
    val returnWhenDone: Boolean = false,
    /** With returnWhenDone: land this long after reaching the hover height unless held. 0 = wait for the pilot. */
    val autoLandAfterMs: Long = 0L,
    /** First waypoint to fly to (0-based, clamped): continue an interrupted route from waypoint N. */
    val startIndex: Int = 0
)

class KMLMissionManager(
    /** Latest virtual-stick state from the module's listener; null when unknown. */
    isVirtualStickEnabled: () -> Boolean?
) {
    companion object {
        private const val TAG = "KMLMissionManager"
        /** Lowest waypoint the executor will fly to (m above the take-off point). */
        private const val MIN_WAYPOINT_ALTITUDE = 5.0
        /** When the drone's own height limit cannot be read. */
        private const val DEFAULT_HEIGHT_LIMIT = 120.0
    }

    private val kmlParser = KMLParser()
    private val optimizer = WaypointOptimizer()
    private val missionManager = WaypointMissionManager.getInstance()
    private val waypointConverter = KMLToWaypointConverter()
    private val missionCreator = DJIWaypointMissionCreator()
    private val litchiStyleCreator = LitchiStyleMissionCreator()
    private val virtualStickExecutor = KMLVirtualStickExecutor(isVirtualStickEnabled)
    
    @Volatile private var currentMissionType: MissionType = MissionType.NONE
    private var missionCallback: KMLMissionCallback? = null

    enum class MissionType {
        NONE, WPMZ_MISSION, VIRTUAL_STICK
    }

    interface KMLMissionCallback {
        fun onMissionPrepared(stats: MissionStats)
        fun onMissionStarted(type: MissionType)
        fun onMissionProgress(progress: MissionProgress)
        /** Completed, stopped and failed fire once per route, after its sticks were released. */
        fun onMissionCompleted()
        fun onMissionFailed(error: String)
        /** [source]: KMLVirtualStickExecutor.SOURCE_* (app, lostControl, djiMode, disconnect, stuck, gps). */
        fun onMissionPaused(reason: String?, source: String)
        fun onMissionResumed()
        /** Stopped before the last waypoint (by the pilot or a return to start). */
        fun onMissionStopped() {}
        /** KMLVirtualStickExecutor.PHASE_*, on change; [targetAltitude] while climbing. */
        fun onMissionPhase(phase: String, targetAltitude: Double?) {}
    }

    data class MissionProgress(
        val currentWaypoint: Int, // absolute index of the waypoint flown to (= waypoints reached)
        val totalWaypoints: Int,
        val progress: Float, // 0.0 to 1.0
        val distanceToTarget: Double = 0.0,
        /** Metres along the route from the drone to the last waypoint (horizontal); null without GPS. */
        val remainingDistance: Double? = null
    )


    /**
     * The file-path import only converted the KML and reported an on-board
     * (WPMZ) mission as started without flying anything. Refused: routes are
     * flown with importAndExecuteKMLFromContent (virtual sticks).
     */
    fun importAndExecuteKML(
        kmlFilePath: String,
        config: MissionConfig,
        callback: KMLMissionCallback,
        promise: Promise
    ) {
        promise.reject("NOT_SUPPORTED", "Importing a route from a file path is not supported; send the KML content instead", null)
    }

    private fun convertKMLToKMZ(kmlFilePath: String): String {
        return try {
            Log.d(TAG, "[DEBUG] === Starting KML to KMZ conversion using DJI SDK v5 approach ===")
            Log.d(TAG, "[DEBUG] Input KML file path: $kmlFilePath")
            
            val kmlFile = File(kmlFilePath)
            if (!kmlFile.exists()) {
                Log.e(TAG, "[ERROR] KML file does not exist: $kmlFilePath")
                return ""
            }
            
            Log.d(TAG, "[DEBUG] KML file exists, size: ${kmlFile.length()} bytes")
            
            // Use the new Litchi-style approach
            Log.d(TAG, "[DEBUG] Using LitchiStyleMissionCreator for conversion")
            val kmzPath = litchiStyleCreator.createKMZFromKMLLitchiStyle(kmlFilePath)
            
            if (kmzPath.isEmpty()) {
                Log.e(TAG, "[ERROR] LitchiStyleMissionCreator.createKMZFromKMLLitchiStyle returned empty path")
                return ""
            }
            
            Log.d(TAG, "[SUCCESS] KML to KMZ conversion completed using Litchi-style approach")
            Log.d(TAG, "[DEBUG] Generated KMZ path: $kmzPath")
            
            kmzPath
            
        } catch (e: Exception) {
            Log.e(TAG, "[ERROR] Exception during KML to KMZ conversion: ${e.message}", e)
            Log.e(TAG, "[ERROR] Exception stack trace: ${e.stackTraceToString()}")
            ""
        }
    }

    val isRouteRunning: Boolean
        get() = virtualStickExecutor.isRunning

    /** Running, or ended a moment ago and still handing the sticks back. */
    val isRouteBusy: Boolean
        get() = virtualStickExecutor.isBusy

    fun pauseMission(promise: Promise) {
        if (!virtualStickExecutor.isRunning) {
            promise.reject("NO_MISSION", "No mission is currently running", null)
            return
        }
        Log.d(TAG, "Pausing virtual stick mission")
        virtualStickExecutor.pauseMission("Paused from the app", KMLVirtualStickExecutor.SOURCE_APP) { error ->
            if (error == null) promise.resolve(mapOf("success" to true, "message" to "Virtual stick mission paused, RC control enabled"))
            else promise.resolve(mapOf("success" to false, "message" to error))
        }
    }

    fun resumeMission(promise: Promise) {
        if (!virtualStickExecutor.isRunning) {
            promise.reject("NO_MISSION", "No mission is currently running", null)
            return
        }
        Log.d(TAG, "Resuming virtual stick mission")
        // Resolves once the sticks are taken again (or with the reason it cannot continue).
        virtualStickExecutor.resumeMission { error ->
            if (error == null) promise.resolve(mapOf("success" to true, "message" to "Virtual stick mission resumed"))
            else promise.resolve(mapOf("success" to false, "message" to error))
        }
    }

    fun stopMission(promise: Promise) {
        if (!virtualStickExecutor.isRunning) {
            promise.reject("NO_MISSION", "No mission is currently running", null)
            return
        }
        Log.d(TAG, "Stopping virtual stick mission")
        virtualStickExecutor.stopMission()
        promise.resolve(mapOf("success" to true, "message" to "Virtual stick mission stopped"))
    }

    /**
     * Stops a running route without reporting it complete. True if one was
     * running; [onReleased] then runs once its sticks are released.
     */
    fun stopActiveMission(onReleased: (() -> Unit)? = null): Boolean =
        virtualStickExecutor.stopMission(onReleased)

    /** Pauses a running route (for example when the drone disconnects). */
    fun pauseActiveMission(reason: String, source: String) {
        if (virtualStickExecutor.isRunning) virtualStickExecutor.pauseMission(reason, source)
    }

    fun getMissionStatus(): Map<String, Any> {
        val running = virtualStickExecutor.isRunning
        return mapOf(
            "isRunning" to running,
            "isPaused" to virtualStickExecutor.isPausedNow,
            "currentWaypoint" to virtualStickExecutor.currentWaypoint,
            "missionType" to (if (running) MissionType.VIRTUAL_STICK else MissionType.NONE).name.lowercase()
        )
    }

    /** Null when every waypoint can be flown, otherwise why not (shown to the pilot). */
    private fun validateRoute(mission: KMLMission): String? {
        if (mission.skippedCoordinates > 0) {
            return "${mission.skippedCoordinates} point(s) of the route could not be read"
        }
        val limit = heightLimit()
        mission.waypoints.forEachIndexed { index, waypoint ->
            val n = index + 1
            if (!waypoint.hasAltitude) return "Waypoint $n has no altitude"
            if (waypoint.altitude < MIN_WAYPOINT_ALTITUDE) {
                return "Waypoint $n is at ${"%.1f".format(waypoint.altitude)} m; the lowest allowed is ${MIN_WAYPOINT_ALTITUDE.toInt()} m"
            }
            if (waypoint.altitude > limit) {
                return "Waypoint $n is at ${"%.1f".format(waypoint.altitude)} m, above the drone's ${limit.toInt()} m height limit"
            }
        }
        return null
    }

    /** The drone's height limit (m), or 120 m when it cannot be read. */
    private fun heightLimit(): Double {
        val limit = try {
            FlightControllerKey.KeyHeightLimit.create().get()
        } catch (e: Exception) {
            null
        }
        return if (limit != null && limit > 0) limit.toDouble() else DEFAULT_HEIGHT_LIMIT
    }

    /** Marks the route ended once the executor reports its end. */
    private fun tracking(callback: KMLMissionCallback) = object : KMLMissionCallback by callback {
        override fun onMissionCompleted() {
            if (!virtualStickExecutor.isRunning) currentMissionType = MissionType.NONE
            callback.onMissionCompleted()
        }

        override fun onMissionFailed(error: String) {
            if (!virtualStickExecutor.isRunning) currentMissionType = MissionType.NONE
            callback.onMissionFailed(error)
        }

        override fun onMissionStopped() {
            if (!virtualStickExecutor.isRunning) currentMissionType = MissionType.NONE
            callback.onMissionStopped()
        }
    }

    fun previewMission(kmlFilePath: String, promise: Promise) {
        try {
            Log.d(TAG, "Attempting to preview KML file at: $kmlFilePath")
            val kmlFile = File(kmlFilePath)
            if (!kmlFile.exists()) {
                Log.e(TAG, "KML file does not exist at: $kmlFilePath")
                promise.reject("FILE_NOT_FOUND", "KML file not found at: $kmlFilePath", null)
                return
            }

            val kmlMission = kmlParser.parseKMLFile(kmlFilePath)
            val optimizedWaypoints = optimizer.optimizeWaypoints(kmlMission.waypoints)
            val stats = optimizer.calculateMissionStats(optimizedWaypoints)

            // Simple validation
            val issues = mutableListOf<String>()
            if (kmlMission.waypoints.isEmpty()) {
                issues.add("No waypoints found")
            }
            if (kmlMission.waypoints.size > 99) {
                issues.add("Too many waypoints (${kmlMission.waypoints.size}), maximum is 99")
            }
            // The same check that refuses the route at take-off.
            validateRoute(kmlMission)?.let { issues.add(it) }

            promise.resolve(mapOf(
                "name" to kmlMission.name,
                "originalWaypoints" to kmlMission.waypoints.size,
                "optimizedWaypoints" to optimizedWaypoints.size,
                "totalDistance" to stats.totalDistance,
                "minAltitude" to stats.minAltitude,
                "maxAltitude" to stats.maxAltitude,
                "altitudeRange" to stats.altitudeRange,
                "isValid" to issues.isEmpty(),
                "issues" to issues,
                "supportsNativeWaypoints" to false // Always use virtual stick for testing
            ))
        } catch (e: Exception) {
            Log.e(TAG, "Error previewing KML: ${e.message}", e)
            promise.reject("PREVIEW_ERROR", "Failed to preview KML: ${e.message}", null)
        }
    }

    fun previewMissionFromContent(kmlContent: String, promise: Promise) {
        try {
            Log.d(TAG, "Attempting to preview KML content, length: ${kmlContent.length}")
            
            val kmlMission = kmlParser.parseKML(kmlContent)
            val optimizedWaypoints = optimizer.optimizeWaypoints(kmlMission.waypoints)
            val stats = optimizer.calculateMissionStats(optimizedWaypoints)

            // Simple validation
            val issues = mutableListOf<String>()
            if (kmlMission.waypoints.isEmpty()) {
                issues.add("No waypoints found")
            }
            if (kmlMission.waypoints.size > 99) {
                issues.add("Too many waypoints (${kmlMission.waypoints.size}), maximum is 99")
            }
            // The same check that refuses the route at take-off.
            validateRoute(kmlMission)?.let { issues.add(it) }

            Log.d(TAG, "Successfully parsed KML: ${kmlMission.waypoints.size} waypoints")

            promise.resolve(mapOf(
                "name" to kmlMission.name,
                "originalWaypoints" to kmlMission.waypoints.size,
                "optimizedWaypoints" to optimizedWaypoints.size,
                "totalDistance" to stats.totalDistance,
                "minAltitude" to stats.minAltitude,
                "maxAltitude" to stats.maxAltitude,
                "altitudeRange" to stats.altitudeRange,
                "isValid" to issues.isEmpty(),
                "issues" to issues,
                "supportsNativeWaypoints" to false // Always use virtual stick for testing
            ))
        } catch (e: Exception) {
            Log.e(TAG, "Error previewing KML from content: ${e.message}", e)
            promise.reject("PREVIEW_ERROR", "Failed to preview KML: ${e.message}", null)
        }
    }

    fun importAndExecuteKMLFromContent(
        kmlContent: String,
        config: MissionConfig,
        callback: KMLMissionCallback,
        promise: Promise
    ) {
        if (virtualStickExecutor.isBusy) {
            promise.reject("ROUTE_RUNNING", "A route is already running; pause or end it first", null)
            return
        }

        try {
            Log.d(TAG, "Attempting to parse KML content, length: ${kmlContent.length}")
            
            val kmlMission = kmlParser.parseKML(kmlContent)
            Log.d(TAG, "Parsed ${kmlMission.waypoints.size} waypoints from KML content")

            if (kmlMission.waypoints.isEmpty()) {
                promise.reject("PARSE_ERROR", "No waypoints found in KML content", null)
                return
            }

            validateRoute(kmlMission)?.let { problem ->
                Log.w(TAG, "Route refused: $problem")
                promise.reject("BAD_ROUTE", problem, null)
                return
            }

            // Step 2: Use original waypoints without optimization (for testing/debugging)
            Log.d(TAG, "Using ORIGINAL waypoints without optimization for accurate path following")
            val originalWaypoints = kmlMission.waypoints
            val stats = optimizer.calculateMissionStats(originalWaypoints)

            // Step 3: Always use virtual stick execution for testing
            Log.d(TAG, "Using Virtual Stick execution with ${originalWaypoints.size} original waypoints")
            val tracked = tracking(callback)
            this.missionCallback = tracked
            callback.onMissionPrepared(stats)

            // Start virtual stick mission with original waypoints
            val refused = virtualStickExecutor.startMission(
                originalWaypoints, tracked,
                faceCenter = config.faceCenter, climbFirst = config.climbFirst, startIndex = config.startIndex
            )
            if (refused != null) {
                promise.reject("ROUTE_RUNNING", refused, null)
                return
            }
            currentMissionType = MissionType.VIRTUAL_STICK

            promise.resolve(mapOf(
                "success" to true,
                "missionType" to "virtual_stick",
                "waypoints" to originalWaypoints.size,
                "message" to "Virtual stick mission started with original waypoints"
            ))

        } catch (e: Exception) {
            Log.e(TAG, "Error importing KML from content: ${e.message}", e)
            promise.reject("IMPORT_ERROR", "Failed to import KML: ${e.message}", null)
        }
    }

    private fun createTempKMLFile(kmlContent: String): String {
        return try {
            Log.d(TAG, "[DEBUG] Creating temporary KML file")
            val context = ContextUtil.getContext()
            Log.d(TAG, "[DEBUG] Got context: ${context != null}")
            
            val tempDir = File(context.cacheDir, "kml_temp")
            Log.d(TAG, "[DEBUG] Temp directory path: ${tempDir.absolutePath}")
            
            if (!tempDir.exists()) {
                Log.d(TAG, "[DEBUG] Creating temp directory")
                val created = tempDir.mkdirs()
                Log.d(TAG, "[DEBUG] Directory created: $created")
            } else {
                Log.d(TAG, "[DEBUG] Temp directory already exists")
            }
            
            val fileName = "mission_${System.currentTimeMillis()}.kml"
            val tempFile = File(tempDir, fileName)
            Log.d(TAG, "[DEBUG] Temp file path: ${tempFile.absolutePath}")
            
            Log.d(TAG, "[DEBUG] Writing KML content to file")
            tempFile.writeText(kmlContent)
            
            val fileSize = tempFile.length()
            Log.d(TAG, "[DEBUG] KML file written successfully, size: $fileSize bytes")
            Log.d(TAG, "[SUCCESS] Created temporary KML file: ${tempFile.absolutePath}")
            
            tempFile.absolutePath
            
        } catch (e: Exception) {
            Log.e(TAG, "[ERROR] Failed to create temporary KML file: ${e.message}", e)
            Log.e(TAG, "[ERROR] Exception stack trace: ${e.stackTraceToString()}")
            ""
        }
    }

    fun convertKMLContentToKMZ(kmlContent: String, promise: Promise) {
        try {
            Log.d(TAG, "[DEBUG] === Starting KML Content to KMZ Conversion ===")
            Log.d(TAG, "[DEBUG] KML content length: ${kmlContent.length} characters")
            Log.d(TAG, "[DEBUG] KML content preview (first 200 chars): ${kmlContent.take(200)}")
            
            // Step 1: Create temporary KML file from content
            Log.d(TAG, "[DEBUG] Step 1: Creating temporary KML file")
            val tempKMLFile = createTempKMLFile(kmlContent)
            if (tempKMLFile.isEmpty()) {
                Log.e(TAG, "[ERROR] Failed to create temporary KML file")
                promise.reject("FILE_ERROR", "Step 1 Failed: Could not create temporary KML file from content", null)
                return
            }
            Log.d(TAG, "[DEBUG] Temporary KML file created: $tempKMLFile")
            
            // Step 2: Convert to KMZ using existing conversion logic
            Log.d(TAG, "[DEBUG] Step 2: Converting temporary KML file to KMZ")
            val kmzPath: String
            try {
                kmzPath = convertKMLToKMZ(tempKMLFile)
            } catch (e: Exception) {
                Log.e(TAG, "[ERROR] Exception in convertKMLToKMZ: ${e.message}", e)
                promise.reject("CONVERSION_ERROR", "Step 2 Failed: Exception in convertKMLToKMZ - ${e.message}", e)
                return
            }
            
            if (kmzPath.isEmpty()) {
                Log.e(TAG, "[ERROR] KML to KMZ conversion failed - returned empty path")
                promise.reject("CONVERSION_ERROR", "Step 2 Failed: convertKMLToKMZ returned empty path - likely missing required DJI classes or KML format issue", null)
                return
            }
            Log.d(TAG, "[DEBUG] KMZ conversion completed: $kmzPath")
            
            // Step 3: Clean up temporary file
            Log.d(TAG, "[DEBUG] Step 3: Cleaning up temporary files")
            try {
                val deleted = File(tempKMLFile).delete()
                Log.d(TAG, "[DEBUG] Temporary KML file deleted: $deleted")
            } catch (e: Exception) {
                Log.w(TAG, "[WARNING] Failed to clean up temporary file: ${e.message}")
            }
            
            Log.d(TAG, "[SUCCESS] === KML to KMZ Conversion Completed Successfully ===")
            promise.resolve(mapOf(
                "success" to true,
                "kmzPath" to kmzPath,
                "message" to "KML successfully converted to KMZ format"
            ))
            
        } catch (e: Exception) {
            Log.e(TAG, "[ERROR] Exception in convertKMLContentToKMZ: ${e.message}", e)
            Log.e(TAG, "[ERROR] Exception stack trace: ${e.stackTraceToString()}")
            val detailedError = "CONVERSION_ERROR: ${e.message}\nStack: ${e.stackTraceToString()}"
            promise.reject("CONVERSION_ERROR", detailedError, e)
        }
    }

    private fun copyContentUriToTempFile(contentUri: String): String {
        return try {
            val context = ContextUtil.getContext()
            val uri = Uri.parse(contentUri)
            val inputStream: InputStream? = context.contentResolver.openInputStream(uri)
            
            if (inputStream == null) {
                Log.e(TAG, "Failed to open input stream for URI: $contentUri")
                return ""
            }

            // Create temporary file
            val tempDir = File(context.cacheDir, "kml_temp")
            if (!tempDir.exists()) {
                tempDir.mkdirs()
            }
            
            val tempFile = File(tempDir, "temp_mission_${System.currentTimeMillis()}.kml")
            val outputStream = FileOutputStream(tempFile)

            // Copy file contents
            var totalBytes = 0
            val buffer = ByteArray(8192)
            var length: Int
            while (inputStream.read(buffer).also { length = it } > 0) {
                outputStream.write(buffer, 0, length)
                totalBytes += length
            }

            outputStream.flush()
            outputStream.close()
            inputStream.close()

            Log.d(TAG, "Successfully copied $totalBytes bytes to temp file: ${tempFile.absolutePath}")
            tempFile.absolutePath
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to copy content URI to temp file: ${e.message}", e)
            ""
        }
    }
}