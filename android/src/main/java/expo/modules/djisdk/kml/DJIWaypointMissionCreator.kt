package expo.modules.djisdk.kml

import android.os.Environment
import android.util.Log
import com.dji.wpmzsdk.manager.WPMZManager
import dji.sdk.wpmz.value.mission.WaylineMission
import dji.sdk.wpmz.value.mission.WaylineMissionConfig
import dji.sdk.wpmz.value.mission.WaylineExecuteWaypoint
import dji.sdk.wpmz.value.mission.Wayline
import dji.sdk.wpmz.value.mission.WaylineLocationCoordinate2D
import dji.sdk.wpmz.value.mission.WaylineExecuteAltitudeMode
import dji.sdk.wpmz.value.mission.WaylineFlyToWaylineMode
import dji.sdk.wpmz.value.mission.WaylineFinishedAction
import com.dji.wpmzsdk.common.data.Template
import java.io.File

/**
 * Creates DJI waypoint missions following the official DJI SDK v5 approach
 * Based on: https://github.com/dji-sdk/Mobile-SDK-Android-V5/blob/dev-sdk-main/SampleCode-V5/android-sdk-v5-sample/src/main/java/dji/sampleV5/aircraft/pages/WayPointV3Fragment.kt
 */
class DJIWaypointMissionCreator {
    companion object {
        private const val TAG = "DJIWaypointMissionCreator"
    }
    
    private val kmlParser = KMLParser()
    
    fun createKMZFromKML(kmlFilePath: String): String {
        return try {
            Log.d(TAG, "[DEBUG] === Creating KMZ using DJI SDK v5 approach ===")
            Log.d(TAG, "[DEBUG] Input KML file: $kmlFilePath")
            
            val kmlFile = File(kmlFilePath)
            if (!kmlFile.exists()) {
                Log.e(TAG, "[ERROR] KML file does not exist: $kmlFilePath")
                return ""
            }
            
            // Setup output path
            val outputDir = Environment.getExternalStorageDirectory().toString() + "/DJI/KMZ/"
            val outputDirFile = File(outputDir)
            if (!outputDirFile.exists()) {
                outputDirFile.mkdirs()
            }
            
            val baseFileName = kmlFile.nameWithoutExtension
            val kmzPath = "$outputDir$baseFileName.kmz"
            Log.d(TAG, "[DEBUG] Target KMZ path: $kmzPath")
            
            // Step 1: Parse KML
            Log.d(TAG, "[DEBUG] Step 1: Parsing KML file")
            val kmlMission = kmlParser.parseKMLFile(kmlFilePath)
            Log.d(TAG, "[DEBUG] Parsed ${kmlMission.waypoints.size} waypoints")
            
            if (kmlMission.waypoints.isEmpty()) {
                Log.e(TAG, "[ERROR] No waypoints found in KML")
                return ""
            }
            
            // Step 2: Create WaylineMission (metadata)
            Log.d(TAG, "[DEBUG] Step 2: Creating WaylineMission")
            val waylineMission = createWaylineMission(kmlMission)
            
            // Step 3: Create WaylineMissionConfig
            Log.d(TAG, "[DEBUG] Step 3: Creating WaylineMissionConfig")
            val missionConfig = createMissionConfig()
            
            // Step 4: Create Wayline with waypoints
            Log.d(TAG, "[DEBUG] Step 4: Creating Wayline")
            val wayline = createWayline(kmlMission)
            
            // Step 5: Generate KMZ file using WPMZManager
            Log.d(TAG, "[DEBUG] Step 5: Generating KMZ file")
            WPMZManager.getInstance().generateKMZFile(kmzPath, waylineMission, missionConfig, wayline)
            
            // Step 6: Verify file was created
            val kmzFile = File(kmzPath)
            if (kmzFile.exists() && kmzFile.length() > 0) {
                Log.d(TAG, "[SUCCESS] KMZ file created successfully")
                Log.d(TAG, "[DEBUG] KMZ file size: ${kmzFile.length()} bytes")
                kmzPath
            } else {
                Log.e(TAG, "[ERROR] KMZ file was not created or is empty")
                ""
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "[ERROR] Failed to create KMZ: ${e.message}", e)
            Log.e(TAG, "[ERROR] Stack trace: ${e.stackTraceToString()}")
            ""
        }
    }
    
    private fun createWaylineMission(kmlMission: KMLMission): WaylineMission {
        Log.d(TAG, "[DEBUG] Creating WaylineMission from KML data")
        
        // WaylineMission is just for metadata in this context
        return WaylineMission().apply {
            author = "KML Import"
            createTime = System.currentTimeMillis().toDouble() / 1000.0
            updateTime = createTime
        }
    }
    
    private fun createWayline(kmlMission: KMLMission): Wayline {
        Log.d(TAG, "[DEBUG] Creating Wayline with waypoints from KML data")
        
        // Convert KML waypoints to DJI WaylineExecuteWaypoints
        val waylineWaypoints = mutableListOf<WaylineExecuteWaypoint>()
        
        kmlMission.waypoints.forEachIndexed { index, kmlWaypoint ->
            val waypoint = WaylineExecuteWaypoint().apply {
                waypointIndex = index
                location = WaylineLocationCoordinate2D(
                    kmlWaypoint.longitude,
                    kmlWaypoint.latitude
                )
                executeHeight = kmlWaypoint.altitude
            }
            waylineWaypoints.add(waypoint)
            Log.d(TAG, "[DEBUG] Created waypoint $index: (${kmlWaypoint.latitude}, ${kmlWaypoint.longitude}, ${kmlWaypoint.altitude}m)")
        }
        
        // Create Wayline
        return Wayline().apply {
            waylineId = 0
            autoFlightSpeed = 5.0 // 5 m/s default speed
            waypoints = waylineWaypoints
            mode = WaylineExecuteAltitudeMode.RELATIVE_TO_START_POINT
        }
    }
    
    private fun createMissionConfig(): WaylineMissionConfig {
        return WaylineMissionConfig().apply {
            flyToWaylineMode = WaylineFlyToWaylineMode.SAFELY
            finishAction = WaylineFinishedAction.GO_HOME
            globalTransitionalSpeed = 5.0
        }
    }
    
    private fun createTemplate(): Template {
        // Basic template - can be enhanced later
        return Template()
    }
}