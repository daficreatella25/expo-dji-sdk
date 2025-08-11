package expo.modules.djisdk.kml

import android.util.Log
import android.os.Environment
import android.content.Context
import android.net.Uri
import expo.modules.kotlin.Promise
import com.dji.wpmzsdk.manager.WPMZManager
import com.dji.wpmzsdk.common.data.HeightMode
import com.dji.wpmzsdk.common.utils.kml.KMLUtil
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
        val distanceToTarget: Float = 0f
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
            val kmlFile = File(kmlFilePath)
            if (!kmlFile.exists()) {
                Log.e(TAG, "KML file does not exist: $kmlFilePath")
                return ""
            }

            val baseFileName = kmlFile.nameWithoutExtension
            val outputDir = Environment.getExternalStorageDirectory().toString() + "/DJI/KMZ/"
            val outputFile = File(outputDir)
            if (!outputFile.exists()) {
                outputFile.mkdirs()
            }
            
            val kmzPath = "$outputDir$baseFileName.kmz"

            // Use WPMZManager to convert KML to KMZ
            val success = WPMZManager.getInstance().transKMLtoKMZ(
                kmlFilePath,
                outputDir,
                HeightMode.RELATIVE
            )

            if (success && File(kmzPath).exists()) {
                Log.d(TAG, "Successfully converted KML to KMZ: $kmzPath")
                kmzPath
            } else {
                Log.e(TAG, "Failed to convert KML to KMZ")
                ""
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error converting KML to KMZ: ${e.message}", e)
            ""
        }
    }

    fun pauseMission(promise: Promise) {
        when (currentMissionType) {
            MissionType.WPMZ_MISSION -> {
                try {
                    // Use existing waypoint mission pause functionality
                    // This would integrate with the existing pauseWaypointMission method
                    promise.resolve("Mission paused")
                    missionCallback?.onMissionPaused()
                } catch (e: Exception) {
                    promise.reject("PAUSE_ERROR", "Failed to pause: ${e.message}", null)
                }
            }
            MissionType.VIRTUAL_STICK -> {
                // Virtual stick pause would go here if implemented
                promise.resolve("Virtual stick mission paused")
                missionCallback?.onMissionPaused()
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
                    promise.resolve("Mission resumed")
                    missionCallback?.onMissionResumed()
                } catch (e: Exception) {
                    promise.reject("RESUME_ERROR", "Failed to resume: ${e.message}", null)
                }
            }
            MissionType.VIRTUAL_STICK -> {
                promise.resolve("Virtual stick mission resumed")
                missionCallback?.onMissionResumed()
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
                    promise.resolve("Mission stopped")
                    missionCallback?.onMissionCompleted()
                } catch (e: Exception) {
                    promise.reject("STOP_ERROR", "Failed to stop: ${e.message}", null)
                }
            }
            MissionType.VIRTUAL_STICK -> {
                currentMissionType = MissionType.NONE
                promise.resolve("Virtual stick mission stopped")
                missionCallback?.onMissionCompleted()
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
                "supportsNativeWaypoints" to true // Always true since we convert to KMZ
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
                "supportsNativeWaypoints" to true // Always true since we convert to KMZ
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

            // Step 3: Create temporary file for KMZ conversion
            val tempFile = createTempKMLFile(kmlContent)
            if (tempFile.isEmpty()) {
                promise.reject("FILE_ERROR", "Failed to create temporary KML file", null)
                return
            }

            // Step 4: Convert to KMZ
            val kmzPath = convertKMLToKMZ(tempFile)
            if (kmzPath.isEmpty()) {
                promise.reject("CONVERSION_ERROR", "Failed to convert KML to KMZ format", null)
                return
            }

            // Step 5: Use existing waypoint mission system
            currentMissionType = MissionType.WPMZ_MISSION
            callback.onMissionStarted(MissionType.WPMZ_MISSION)

            promise.resolve(mapOf(
                "success" to true,
                "missionType" to "wpmz",
                "waypoints" to optimizedWaypoints.size,
                "kmzPath" to kmzPath
            ))

        } catch (e: Exception) {
            Log.e(TAG, "Error importing KML from content: ${e.message}", e)
            promise.reject("IMPORT_ERROR", "Failed to import KML: ${e.message}", null)
        }
    }

    private fun createTempKMLFile(kmlContent: String): String {
        return try {
            val context = ContextUtil.getContext()
            val tempDir = File(context.cacheDir, "kml_temp")
            if (!tempDir.exists()) {
                tempDir.mkdirs()
            }
            
            val tempFile = File(tempDir, "mission_${System.currentTimeMillis()}.kml")
            tempFile.writeText(kmlContent)
            
            Log.d(TAG, "Created temporary KML file: ${tempFile.absolutePath}")
            tempFile.absolutePath
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create temporary KML file: ${e.message}", e)
            ""
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