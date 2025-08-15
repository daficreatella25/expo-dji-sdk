package expo.modules.djisdk.kml

import android.util.Log
import android.os.Environment
import com.dji.wpmzsdk.manager.WPMZManager
import dji.sdk.wpmz.value.mission.WaylineMission
import dji.sdk.wpmz.value.mission.WaylineMissionConfig
import dji.sdk.wpmz.value.mission.WaylineWaypoint
import dji.sdk.wpmz.value.mission.WaylineLocationCoordinate2D
import dji.sdk.wpmz.value.mission.WaylineLocationCoordinate3D
import dji.sdk.wpmz.value.mission.WaylineTemplate
import dji.sdk.wpmz.value.mission.WaylineTemplateType
import dji.sdk.wpmz.value.mission.WaylineFlyToWaylineMode
import dji.sdk.wpmz.value.mission.WaylineFinishedAction
import dji.sdk.wpmz.value.mission.WaylineExitOnRCLostBehavior
import dji.sdk.wpmz.value.mission.WaylineExitOnRCLostAction
import dji.sdk.wpmz.value.mission.WaylineDroneInfo
import dji.sdk.wpmz.value.mission.WaylineDroneType
import dji.sdk.wpmz.value.mission.WaylinePayloadInfo
import dji.sdk.wpmz.value.mission.WaylinePayloadType
import dji.sdk.wpmz.value.mission.WaylinePayloadParam
import dji.sdk.wpmz.value.mission.WaylineWaypointPitchMode
import dji.sdk.wpmz.value.mission.WaylineTemplateWaypointInfo
import dji.sdk.wpmz.value.mission.WaylineWaypointTurnMode
import dji.sdk.wpmz.value.mission.WaylineWaypointTurnParam
import dji.sdk.wpmz.value.mission.WaylineWaypointYawParam
import dji.sdk.wpmz.value.mission.WaylineWaypointYawMode
import dji.sdk.wpmz.value.mission.WaylineWaypointYawPathMode
import dji.sdk.wpmz.value.mission.WaylineWaypointGimbalHeadingParam
import dji.sdk.wpmz.value.mission.WaylineWaypointGimbalHeadingMode
import dji.sdk.wpmz.value.mission.WaylineCoordinateParam
import dji.sdk.wpmz.value.mission.WaylineCoordinateMode
import dji.sdk.wpmz.value.mission.WaylineAltitudeMode
import dji.sdk.wpmz.value.mission.Wayline
import dji.sdk.wpmz.value.mission.WaylineExecuteAltitudeMode
import dji.sdk.wpmz.value.mission.WaylineExecuteCoordinateMode
import dji.sdk.wpmz.value.mission.WaylineExecuteMissionConfig
import dji.sdk.wpmz.value.mission.AgricultureWorkMode
import dji.sdk.wpmz.value.mission.WaylineActionGroup
import dji.sdk.wpmz.value.mission.WaylineActionsRelationType
import dji.sdk.wpmz.value.mission.WaylineActionTrigger
import dji.sdk.wpmz.value.mission.WaylineActionTriggerType
import dji.sdk.wpmz.value.mission.WaylineActionInfo
import dji.sdk.wpmz.value.mission.WaylineActionNodeList
import com.dji.wpmzsdk.common.utils.PPalGenerator
import java.io.File

/**
 * Creates KMZ files using the same approach as Litchi
 * This replicates Litchi's WaypointTemplateTransform methodology
 */
class LitchiStyleMissionCreator {
    companion object {
        private const val TAG = "LitchiStyleMissionCreator"
    }

    private val kmlParser = KMLParser()

    fun createKMZFromKMLLitchiStyle(kmlFilePath: String): String {
        return try {
            Log.d(TAG, "[DEBUG] === Creating KMZ using Litchi-style approach ===")
            Log.d(TAG, "[DEBUG] Input KML file: $kmlFilePath")

            val kmlFile = File(kmlFilePath)
            if (!kmlFile.exists()) {
                Log.e(TAG, "[ERROR] KML file does not exist: $kmlFilePath")
                return ""
            }

            // Step 1: Parse KML
            Log.d(TAG, "[DEBUG] Step 1: Parsing KML file")
            val kmlMission = kmlParser.parseKMLFile(kmlFilePath)
            Log.d(TAG, "[DEBUG] Parsed ${kmlMission.waypoints.size} waypoints")

            if (kmlMission.waypoints.isEmpty()) {
                Log.e(TAG, "[ERROR] No waypoints found in KML")
                return ""
            }

            // Step 2: Create output path (using app-specific external directory to avoid permission issues)
            val context = dji.v5.utils.common.ContextUtil.getContext()
            val outputDir = if (context.getExternalFilesDir(null) != null) {
                File(context.getExternalFilesDir(null), "DJI/KMZ").absolutePath + "/"
            } else {
                File(context.filesDir, "DJI/KMZ").absolutePath + "/"
            }
            val outputDirFile = File(outputDir)
            Log.d(TAG, "[DEBUG] Output directory: $outputDir")
            
            if (!outputDirFile.exists()) {
                val created = outputDirFile.mkdirs()
                Log.d(TAG, "[DEBUG] Created output directory: $created")
            } else {
                Log.d(TAG, "[DEBUG] Output directory already exists")
            }

            val baseFileName = kmlFile.nameWithoutExtension
            val kmzPath = "$outputDir$baseFileName.kmz"
            Log.d(TAG, "[DEBUG] Target KMZ path: $kmzPath")

            // Step 3: Create WaylineMission (following Litchi's pattern)
            Log.d(TAG, "[DEBUG] Step 3: Creating WaylineMission")
            val waylineMission = createLitchiStyleWaylineMission(kmlMission)

            // Step 4: Create WaylineMissionConfig (following Litchi's pattern)
            Log.d(TAG, "[DEBUG] Step 4: Creating WaylineMissionConfig")
            val missionConfig = createLitchiStyleMissionConfig()

            // Step 5: Create WaylineTemplate and generate Waylines using PPalGenerator (exactly like Litchi)
            Log.d(TAG, "[DEBUG] Step 5: Creating WaylineTemplate and generating Waylines using PPalGenerator")
            val template = createLitchiStyleWaylineTemplate(kmlMission)
            
            // Use PPalGenerator like Litchi does
            val ppalGenerator = PPalGenerator()
            // Create a basic execute mission config
            val executeMissionConfig = WaylineExecuteMissionConfig()
            val ppalParam = PPalGenerator.PPALParam(waylineMission, missionConfig, executeMissionConfig, listOf(template))
            val waylines = ppalGenerator.getWaylines(ppalParam)
            
            if (waylines.isEmpty()) {
                Log.e(TAG, "[ERROR] PPalGenerator returned no waylines")
                return ""
            }
            
            val wayline = waylines.first()
            Log.d(TAG, "[DEBUG] PPalGenerator created wayline with ${wayline.getWaypoints()?.size} waypoints")

            // Step 6: Generate KMZ using WPMZManager (same as Litchi)
            Log.d(TAG, "[DEBUG] Step 6: Generating KMZ file using WPMZManager")
            Log.d(TAG, "[DEBUG] WPMZManager instance: ${WPMZManager.getInstance()}")
            Log.d(TAG, "[DEBUG] Target KMZ path: $kmzPath")
            Log.d(TAG, "[DEBUG] WaylineMission: $waylineMission")
            Log.d(TAG, "[DEBUG] WaylineMissionConfig: $missionConfig")
            Log.d(TAG, "[DEBUG] Wayline with ${wayline.getWaypoints()?.size} waypoints")
            
            try {
                WPMZManager.getInstance().generateKMZFile(kmzPath, waylineMission, missionConfig, wayline)
                Log.d(TAG, "[DEBUG] WPMZManager.generateKMZFile() completed successfully")
            } catch (e: Exception) {
                Log.e(TAG, "[ERROR] WPMZManager.generateKMZFile() threw exception: ${e.message}", e)
                Log.e(TAG, "[ERROR] Exception class: ${e.javaClass.simpleName}")
                Log.e(TAG, "[ERROR] Stack trace: ${e.stackTraceToString()}")
                throw e
            }

            // Step 7: Verify file was created
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

    private fun createLitchiStyleWaylineMission(kmlMission: KMLMission): WaylineMission {
        Log.d(TAG, "[DEBUG] Creating WaylineMission following Litchi's pattern")

        return WaylineMission().apply {
            author = "KML Import"
            createTime = System.currentTimeMillis().toDouble() / 1000.0
            updateTime = createTime
        }
    }

    private fun createLitchiStyleMissionConfig(): WaylineMissionConfig {
        Log.d(TAG, "[DEBUG] Creating WaylineMissionConfig following Litchi's pattern")

        return WaylineMissionConfig().apply {
            // Basic configuration following Litchi's WaypointTemplateTransform.transConfigFrom()
            flyToWaylineMode = WaylineFlyToWaylineMode.SAFELY
            finishAction = WaylineFinishedAction.GO_HOME
            globalTransitionalSpeed = 15.0 // Litchi uses 15.0

            // Drone info
            droneInfo = WaylineDroneInfo().apply {
                droneType = WaylineDroneType.UNKNOWN
            }

            // Security settings
            securityTakeOffHeight = 20.0 // Default takeoff height
            isSecurityTakeOffHeightSet = true

            // RC lost behavior
            exitOnRCLostBehavior = WaylineExitOnRCLostBehavior.GO_ON
            exitOnRCLostType = WaylineExitOnRCLostAction.HOVER

            // Position settings
            isTakeOffPositionRefSet = false
            isGlobalRTHHeightSet = false

            // Payload info (basic camera)
            payloadInfo = listOf(
                WaylinePayloadInfo().apply {
                    payloadType = WaylinePayloadType.UNKNOWN
                }
            )
        }
    }

    private fun createLitchiStyleWaylineTemplate(kmlMission: KMLMission): WaylineTemplate {
        Log.d(TAG, "[DEBUG] Creating WaylineTemplate following Litchi's exact pattern")

        val waypoints = mutableListOf<WaylineWaypoint>()

        // Convert KML waypoints to DJI WaylineWaypoint (exactly like Litchi does)
        kmlMission.waypoints.forEachIndexed { index, kmlWaypoint ->
            // Validate coordinates
            if (kmlWaypoint.latitude < -90.0 || kmlWaypoint.latitude > 90.0) {
                Log.e(TAG, "[ERROR] Invalid latitude at waypoint $index: ${kmlWaypoint.latitude}")
                return WaylineTemplate() // Return empty template on invalid coordinates
            }
            if (kmlWaypoint.longitude < -180.0 || kmlWaypoint.longitude > 180.0) {
                Log.e(TAG, "[ERROR] Invalid longitude at waypoint $index: ${kmlWaypoint.longitude}")
                return WaylineTemplate() // Return empty template on invalid coordinates
            }
            if (kmlWaypoint.altitude < 0.0 || kmlWaypoint.altitude > 500.0) {
                Log.e(TAG, "[ERROR] Invalid altitude at waypoint $index: ${kmlWaypoint.altitude}")
                return WaylineTemplate() // Return empty template on invalid coordinates
            }
            
            val waypoint = WaylineWaypoint().apply {
                // Basic waypoint properties exactly like Litchi
                waypointIndex = index
                location = WaylineLocationCoordinate2D().apply {
                    setLongitude(kmlWaypoint.longitude)
                    setLatitude(kmlWaypoint.latitude)
                }
                
                // CRITICAL: Set both height and ellipsoidHeight like Litchi does
                setHeight(kmlWaypoint.altitude)
                setEllipsoidHeight(kmlWaypoint.altitude) // WGS84 ellipsoid height
                
                // Speed settings - follow Litchi's pattern (lines 381-384 in WaypointTemplateTransform)
                setSpeed(5.0) // Set waypoint-specific speed
                setUseGlobalAutoFlightSpeed(false) // Use waypoint-specific speed like Litchi does
                
                // Flight height - follow Litchi's pattern (line 380 in WaypointTemplateTransform)
                setUseGlobalFlightHeight(false) // Use waypoint-specific height like Litchi
                
                // Basic parameters like Litchi
                setUseStraightLine(false) // Will be set by turn params if needed
                setIsRisky(false)
                setGimbalPitchAngle(-90.0) // Point camera downward
                setUseGlobalActionGroup(true) // Use global actions (no waypoint-specific actions)
                
                // CRITICAL: Follow Litchi's exact conditional logic for yaw parameters
                // For basic KML waypoints, we don't set individual yaw params (lines 387-406)
                val shouldUseIndividualYawParams = false // For basic KML import, use global yaw
                setUseGlobalYawParam(!shouldUseIndividualYawParams) // true = use global yaw
                setIsWaylineWaypointYawParamSet(shouldUseIndividualYawParams) // false = no individual yaw
                // Don't set yawParam when using global
                
                // CRITICAL: Follow Litchi's exact conditional logic for turn parameters
                // For basic KML waypoints, we don't set individual turn params (lines 407-416)
                val shouldUseIndividualTurnParams = false // For basic KML import, use global turn
                setUseGlobalTurnParam(!shouldUseIndividualTurnParams) // true = use global turn
                setIsWaylineWaypointTurnParamSet(shouldUseIndividualTurnParams) // false = no individual turn
                // Don't set turnParam when using global
                
                // CRITICAL: Gimbal heading parameters - use global like Litchi
                setUseGlobalGimbalHeadingParam(true) // Use global gimbal settings  
                setIsWaylineWaypointGimbalHeadingParamSet(false) // Don't set individual gimbal
            }
            waypoints.add(waypoint)
            Log.d(TAG, "[DEBUG] Created Litchi-style waypoint $index: (${kmlWaypoint.latitude}, ${kmlWaypoint.longitude}, ${kmlWaypoint.altitude}m)")
        }

        // Create WaylineTemplateWaypointInfo following Litchi's exact pattern (lines 289-312)
        val waypointInfo = WaylineTemplateWaypointInfo().apply {
            setWaypoints(waypoints)
            setActionGroups(ArrayList()) // Empty action groups for basic missions
            
            // CRITICAL: Set global flight height like Litchi (lines 292-294)
            setGlobalFlightHeight(kmlMission.waypoints.firstOrNull()?.altitude ?: 50.0)
            setIsGlobalFlightHeightSet(true)
            
            // CRITICAL: Set global yaw parameters like Litchi (lines 305-309)
            val globalYawParam = WaylineWaypointYawParam().apply {
                // Use FOLLOW_WAYLINE yaw mode for basic waypoint missions (most common in Litchi)
                setYawMode(WaylineWaypointYawMode.FOLLOW_WAYLINE)
                setYawPathMode(WaylineWaypointYawPathMode.CLOCKWISE)
                // Set a default POI location (required when using POI modes)
                setPoiLocation(WaylineLocationCoordinate3D(
                    kmlMission.waypoints.firstOrNull()?.latitude ?: 0.0,
                    kmlMission.waypoints.firstOrNull()?.longitude ?: 0.0,
                    0.0
                ))
            }
            setGlobalYawParam(globalYawParam)
            setIsTemplateGlobalYawParamSet(true)
            
            // CRITICAL: Set global turn parameters like Litchi (lines 301-304)
            setGlobalTurnMode(WaylineWaypointTurnMode.COORDINATE_TURN) // Coordinate turn is most common
            setUseStraightLine(false) // Allow curved paths between waypoints
            setIsTemplateGlobalTurnModeSet(true)
            
            // Gimbal/camera settings like Litchi
            setPitchMode(WaylineWaypointPitchMode.MANUALLY) // Manual gimbal control
            
            // Flight calibration
            setCaliFlightEnable(false) // No calibration for basic missions
            
            // Global actions
            setIsGlobalActionSet(false) // No global actions for basic missions
        }

        // Create coordinate parameters (like Litchi does)
        val coordinateParam = WaylineCoordinateParam().apply {
            setCoordinateMode(WaylineCoordinateMode.WGS84)
            // positioningType is handled by DJI
            setIsGlobalShootHeightSet(false)
        }

        // Create the template (exactly like Litchi) - keep it simple without payload params
        val template = WaylineTemplate().apply {
            setTemplateId(0)
            setTemplateType(WaylineTemplateType.WAYPOINT)
            setWaypointInfo(waypointInfo)
            setCoordinateParam(coordinateParam)
            setUseGlobalTransitionalSpeed(true)
            setAutoFlightSpeed(5.0)
            // No payload params - let PPalGenerator handle defaults
        }
        
        Log.d(TAG, "[DEBUG] WaylineTemplate created with ${waypoints.size} waypoints following Litchi's exact pattern")
        
        return template
    }
}