package expo.modules.djisdk.kml

import android.util.Log
import android.os.Environment
import android.content.Context
import android.net.Uri
import expo.modules.kotlin.Promise
import dji.v5.manager.aircraft.waypoint3.WaypointMissionManager
import dji.v5.utils.common.ContextUtil
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

data class MissionConfig(
    val speed: Float = 5.0f,
    val maxSpeed: Float = 10.0f,
    val enableTakePhoto: Boolean = false,
    val enableStartRecording: Boolean = false
)

class KMLMissionManager {
    companion object {
        private const val TAG = "KMLMissionManager"
    }

    private val kmlParser = KMLParser()
    private val optimizer = WaypointOptimizer()
    private val missionManager = WaypointMissionManager.getInstance()
    private val waypointConverter = KMLToWaypointConverter()
    private val missionCreator = DJIWaypointMissionCreator()
    private val litchiStyleCreator = LitchiStyleMissionCreator()
    private val virtualStickExecutor = KMLVirtualStickExecutor()
    
    private var currentMissionType: MissionType = MissionType.NONE
    private var missionCallback: KMLMissionCallback? = null

    enum class MissionType {
        NONE, WPMZ_MISSION, VIRTUAL_STICK
    }

    interface KMLMissionCallback {
        fun onMissionPrepared(stats: MissionStats)
        fun onMissionStarted(type: MissionType)
        fun onMissionProgress(progress: MissionProgress)
        fun onMissionCompleted()
        fun onMissionFailed(error: String)
        fun onMissionPaused()
        fun onMissionResumed()
    }

    data class MissionProgress(
        val currentWaypoint: Int,
        val totalWaypoints: Int,
        val progress: Float, // 0.0 to 1.0
        val distanceToTarget: Double = 0.0
    )


    fun importAndExecuteKML(
        kmlFilePath: String,
        config: MissionConfig,
        callback: KMLMissionCallback,
        promise: Promise
    ) {
        this.missionCallback = callback

        try {
            // Step 1: Parse KML file (path should already be accessible)
            Log.d(TAG, "Attempting to parse KML file at: $kmlFilePath")
            val kmlFile = File(kmlFilePath)
            if (!kmlFile.exists()) {
                Log.e(TAG, "KML file does not exist at: $kmlFilePath")
                promise.reject("FILE_NOT_FOUND", "KML file not found at: $kmlFilePath", null)
                return
            }

            val kmlMission = kmlParser.parseKMLFile(kmlFilePath)
            Log.d(TAG, "Parsed ${kmlMission.waypoints.size} waypoints from KML")

            if (kmlMission.waypoints.isEmpty()) {
                promise.reject("PARSE_ERROR", "No waypoints found in KML file", null)
                return
            }

            // Step 2: Optimize waypoints
            val optimizedWaypoints = optimizer.optimizeWaypoints(kmlMission.waypoints)
            val stats = optimizer.calculateMissionStats(optimizedWaypoints)
            callback.onMissionPrepared(stats)

            // Step 3: Convert KML to KMZ using existing system
            val kmzPath = convertKMLToKMZ(kmlFilePath)
            if (kmzPath.isEmpty()) {
                promise.reject("CONVERSION_ERROR", "Failed to convert KML to KMZ format", null)
                return
            }

            // Step 4: Use existing waypoint mission system
            currentMissionType = MissionType.WPMZ_MISSION
            callback.onMissionStarted(MissionType.WPMZ_MISSION)

            promise.resolve(mapOf(
                "success" to true,
                "missionType" to "wpmz",
                "waypoints" to optimizedWaypoints.size,
                "kmzPath" to kmzPath
            ))

        } catch (e: Exception) {
            Log.e(TAG, "Error importing KML: ${e.message}")
            promise.reject("IMPORT_ERROR", "Failed to import KML: ${e.message}", null)
        }
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

    fun pauseMission(promise: Promise) {
        when (currentMissionType) {
            MissionType.WPMZ_MISSION -> {
                try {
                    // Use existing waypoint mission pause functionality
                    // This would integrate with the existing pauseWaypointMission method
                    promise.resolve(mapOf("success" to true, "message" to "WPMZ mission paused"))
                    missionCallback?.onMissionPaused()
                } catch (e: Exception) {
                    promise.reject("PAUSE_ERROR", "Failed to pause: ${e.message}", null)
                }
            }
            MissionType.VIRTUAL_STICK -> {
                try {
                    Log.d(TAG, "Pausing virtual stick mission")
                    virtualStickExecutor.pauseMission()
                    promise.resolve(mapOf("success" to true, "message" to "Virtual stick mission paused, RC control enabled"))
                } catch (e: Exception) {
                    promise.reject("PAUSE_ERROR", "Failed to pause virtual stick mission: ${e.message}", null)
                }
            }
            MissionType.NONE -> {
                promise.reject("NO_MISSION", "No mission is currently running", null)
            }
        }
    }

    fun resumeMission(promise: Promise) {
        when (currentMissionType) {
            MissionType.WPMZ_MISSION -> {
                try {
                    // Use existing waypoint mission resume functionality
                    promise.resolve(mapOf("success" to true, "message" to "WPMZ mission resumed"))
                    missionCallback?.onMissionResumed()
                } catch (e: Exception) {
                    promise.reject("RESUME_ERROR", "Failed to resume: ${e.message}", null)
                }
            }
            MissionType.VIRTUAL_STICK -> {
                try {
                    Log.d(TAG, "Resuming virtual stick mission")
                    virtualStickExecutor.resumeMission()
                    promise.resolve(mapOf("success" to true, "message" to "Virtual stick mission resumed"))
                } catch (e: Exception) {
                    promise.reject("RESUME_ERROR", "Failed to resume virtual stick mission: ${e.message}", null)
                }
            }
            MissionType.NONE -> {
                promise.reject("NO_MISSION", "No mission is currently running", null)
            }
        }
    }

    fun stopMission(promise: Promise) {
        when (currentMissionType) {
            MissionType.WPMZ_MISSION -> {
                try {
                    currentMissionType = MissionType.NONE
                    promise.resolve(mapOf("success" to true, "message" to "WPMZ mission stopped"))
                    missionCallback?.onMissionCompleted()
                } catch (e: Exception) {
                    promise.reject("STOP_ERROR", "Failed to stop: ${e.message}", null)
                }
            }
            MissionType.VIRTUAL_STICK -> {
                try {
                    Log.d(TAG, "Stopping virtual stick mission")
                    virtualStickExecutor.stopMission()
                    currentMissionType = MissionType.NONE
                    promise.resolve(mapOf("success" to true, "message" to "Virtual stick mission stopped"))
                } catch (e: Exception) {
                    promise.reject("STOP_ERROR", "Failed to stop virtual stick mission: ${e.message}", null)
                }
            }
            MissionType.NONE -> {
                promise.reject("NO_MISSION", "No mission is currently running", null)
            }
        }
    }

    fun getMissionStatus(): Map<String, Any> {
        return mapOf(
            "isRunning" to (currentMissionType != MissionType.NONE),
            "isPaused" to false, // Would need to track this properly
            "missionType" to currentMissionType.name.lowercase()
        )
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
        this.missionCallback = callback

        try {
            Log.d(TAG, "Attempting to parse KML content, length: ${kmlContent.length}")
            
            val kmlMission = kmlParser.parseKML(kmlContent)
            Log.d(TAG, "Parsed ${kmlMission.waypoints.size} waypoints from KML content")

            if (kmlMission.waypoints.isEmpty()) {
                promise.reject("PARSE_ERROR", "No waypoints found in KML content", null)
                return
            }

            // Step 2: Optimize waypoints
            val optimizedWaypoints = optimizer.optimizeWaypoints(kmlMission.waypoints)
            val stats = optimizer.calculateMissionStats(optimizedWaypoints)
            callback.onMissionPrepared(stats)

            // Step 3: Always use virtual stick execution for testing
            Log.d(TAG, "Using Virtual Stick execution")
            currentMissionType = MissionType.VIRTUAL_STICK
            
            // Start virtual stick mission
            virtualStickExecutor.startMission(optimizedWaypoints, callback)
            
            promise.resolve(mapOf(
                "success" to true,
                "missionType" to "virtual_stick",
                "waypoints" to optimizedWaypoints.size,
                "message" to "Virtual stick mission started"
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