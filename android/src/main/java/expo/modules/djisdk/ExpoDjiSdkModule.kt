package expo.modules.djisdk

import android.content.Context
import android.util.Log
import dji.v5.common.error.IDJIError
import dji.v5.common.register.DJISDKInitEvent
import dji.v5.common.callback.CommonCallbacks
import dji.v5.manager.SDKManager
import dji.v5.manager.interfaces.SDKManagerCallback
import dji.v5.manager.aircraft.virtualstick.VirtualStickManager
import dji.v5.manager.aircraft.virtualstick.VirtualStickStateListener
import dji.v5.manager.aircraft.virtualstick.VirtualStickState
import dji.sdk.keyvalue.value.flightcontroller.FlightControlAuthorityChangeReason
import dji.sdk.keyvalue.value.flightcontroller.VirtualStickFlightControlParam
import dji.sdk.keyvalue.value.flightcontroller.RollPitchControlMode
import dji.sdk.keyvalue.value.flightcontroller.YawControlMode
import dji.sdk.keyvalue.value.flightcontroller.VerticalControlMode
import dji.sdk.keyvalue.value.flightcontroller.FlightCoordinateSystem
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.interfaces.ICameraStreamManager
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.sdk.keyvalue.value.common.LocationCoordinate3D
import android.view.Surface
import dji.sdk.keyvalue.key.ProductKey
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.v5.et.create
import dji.v5.et.get
import dji.v5.et.action
import dji.v5.manager.intelligent.IntelligentFlightManager
import dji.v5.manager.intelligent.flyto.FlyToTarget
import dji.v5.manager.intelligent.flyto.FlyToInfo
import dji.sdk.keyvalue.value.flightcontroller.FlyToMode
import dji.v5.manager.aircraft.waypoint3.WaypointMissionManager
import dji.v5.manager.aircraft.waypoint3.model.WaypointMissionExecuteState
import dji.v5.manager.aircraft.waypoint3.WaypointMissionExecuteStateListener
import com.dji.wpmzsdk.manager.WPMZManager
import com.dji.wpmzsdk.common.data.HeightMode
import com.dji.wpmzsdk.common.utils.kml.KMLUtil
import com.dji.wpmzsdk.common.utils.kml.KMLFileParseInfo
import com.dji.wpmzsdk.common.utils.kml.data.MissionType
import com.dji.wpmzsdk.common.utils.kml.transfrom.MissionTransformData
import com.dji.wpmzsdk.common.utils.kml.converter.MissionGreenDaoTransform
import com.dji.wpmzsdk.common.data.Template as WPMZTemplate
import com.dji.wpmzsdk.common.utils.TemplateTransform
import com.dji.industry.pilot.missionflight.library.MissionImportParams
import com.dji.wpmzsdk.common.utils.kml.data.MissionImportHeightMode
import dji.sdk.wpmz.value.mission.WaylineMissionConfig
import dji.sdk.wpmz.value.mission.WaylineMission
import dji.sdk.wpmz.value.mission.WaylineWaypoint
import dji.sdk.wpmz.value.mission.WaylineLocationCoordinate2D
import dji.sdk.wpmz.value.mission.WaylineFinishedAction
import dji.sdk.wpmz.value.mission.WaylinePayloadParam
import dji.sdk.wpmz.value.mission.WaylineExitOnRCLostAction
import dji.sdk.wpmz.value.mission.WaylineExitOnRCLostBehavior
import dji.sdk.wpmz.value.mission.WaylineFlyToWaylineMode
import dji.sdk.wpmz.value.mission.WaylineDroneInfo
import dji.sdk.wpmz.value.mission.WaylinePayloadInfo
import dji.sdk.wpmz.value.mission.WaylineTemplateWaypointInfo
import dji.sdk.wpmz.value.mission.WaylineCoordinateParam
import dji.sdk.wpmz.value.mission.WaylineCoordinateMode
import dji.sdk.wpmz.value.mission.WaylineAltitudeMode
import dji.sdk.wpmz.value.mission.WaylineWaypointYawParam
import dji.sdk.wpmz.value.mission.WaylineWaypointYawMode
import dji.sdk.wpmz.value.mission.WaylineWaypointYawPathMode
import dji.sdk.wpmz.value.mission.WaylineWaypointGimbalHeadingParam
import dji.sdk.wpmz.value.mission.WaylineWaypointGimbalHeadingMode
import com.dji.wpmzsdk.manager.WPMZManager as WPMZManagerSdk
import com.dji.wpmzsdk.common.data.HeightMode as HeightModeCommon
import dji.sdk.wpmz.value.mission.WaylineCheckErrorMsg
import java.util.ArrayList
import dji.v5.utils.common.DiskUtil
import dji.v5.utils.common.ContextUtil
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.IOException
import android.os.Environment
import android.net.Uri
import android.content.ContentResolver
import dji.sdk.keyvalue.value.common.LocationCoordinate2D
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.djisdk.kml.KMLMissionManager
import expo.modules.djisdk.kml.MissionConfig as KMLMissionConfig

class ExpoDjiSdkModule : Module() {
  companion object {
    private const val TAG = "ExpoDjiSdk"
  }
  
  private val context: Context
    get() = requireNotNull(appContext.reactContext)
  
  private var isProductConnected = false
  private var currentVirtualStickState: VirtualStickState? = null
  private var currentProductId: Int = -1
  private val kmlMissionManager = KMLMissionManager()
  
  // Camera stream management
  private val cameraStreamManager: ICameraStreamManager 
    get() = MediaDataCenter.getInstance().cameraStreamManager
  private var availableCameraListener: ICameraStreamManager.AvailableCameraUpdatedListener? = null
  private var currentCameraSurfaces = mutableMapOf<Int, Surface>()
  
  // Waypoint mission state tracking
  private var currentWaypointMissionState: WaypointMissionExecuteState? = null
  private var waypointDirectoryInitialized = false
  private var wpmzManagerInitialized = false
  private val WAYPOINT_SAMPLE_FILE_DIR = "waypoint/"
  private val WAYPOINT_SAMPLE_FILE_CACHE_DIR = "waypoint/cache/"
  private val rootDir: String
    get() = DiskUtil.getExternalCacheDirPath(ContextUtil.getContext(), WAYPOINT_SAMPLE_FILE_DIR)
  
  // Debug logging
  private var isDebugLoggingEnabled = false
  private val debugLogQueue = mutableListOf<String>()
  private val maxLogEntries = 100

  override fun definition() = ModuleDefinition {
    Name("ExpoDjiSdk")

    Events("onSDKRegistrationResult", "onDroneConnectionChange", "onDroneInfoUpdate", "onSDKInitProgress", "onDatabaseDownloadProgress", "onVirtualStickStateChange", "onAvailableCameraUpdated", "onCameraStreamStatusChange", "onTakeoffResult", "onLandingResult", "onFlightStatusChange", "onWaypointMissionUploadProgress", "onKMLMissionEvent", "onDebugLog")
    
    View(CameraStreamView::class) {
      Prop("cameraIndex") { view: CameraStreamView, cameraIndex: Int ->
        view.setCameraIndex(cameraIndex)
      }

      Prop("streamEnabled") { view: CameraStreamView, enabled: Boolean ->
        view.setStreamEnabled(enabled)
      }

      Prop("scaleType") { view: CameraStreamView, scaleType: Int ->
        view.setScaleType(scaleType)
      }
    }

    AsyncFunction("testSDKClass") { promise: Promise ->
      try {
        Log.d(TAG, "Testing DJI SDK class loading...")
        val sdkManager = SDKManager.getInstance()
        Log.d(TAG, "SDKManager instance obtained successfully")
        promise.resolve(mapOf(
          "success" to true,
          "message" to "SDK classes loaded successfully",
          "sdkVersion" to sdkManager.sdkVersion
        ))
      } catch (e: Exception) {
        Log.e(TAG, "Failed to load SDK classes: ${e.message}", e)
        promise.reject("CLASS_NOT_FOUND", "Failed to load DJI SDK classes: ${e.message}", e)
      }
    }

    AsyncFunction("initializeSDK") { promise: Promise ->
      try {
        Log.d(TAG, "Starting SDK initialization...")
        // Initialize SDK first
        SDKManager.getInstance().init(context, object : SDKManagerCallback {
          override fun onRegisterSuccess() {
            promise.resolve(mapOf(
              "success" to true,
              "message" to "SDK initialized and registered successfully",
              "isRegistered" to true,
              "sdkVersion" to SDKManager.getInstance().sdkVersion
            ))
          }

          override fun onRegisterFailure(error: IDJIError) {
            promise.reject("REGISTRATION_ERROR", "Failed to register app: ${error.description()}", null)
          }

          override fun onProductDisconnect(productId: Int) {
            isProductConnected = false
            currentVirtualStickState = null
            currentProductId = -1
            sendEvent("onDroneConnectionChange", mapOf(
              "connected" to false,
              "productId" to productId
            ))
          }

          override fun onProductConnect(productId: Int) {
            isProductConnected = true
            currentProductId = productId
            sendEvent("onDroneConnectionChange", mapOf(
              "connected" to true,
              "productId" to productId
            ))
            
            setupVirtualStickListener()
            setupCameraStreamListener()
            getDroneBasicInfo()
          }

          override fun onProductChanged(productId: Int) {
            getDroneBasicInfo()
          }

          override fun onInitProcess(event: DJISDKInitEvent, totalProcess: Int) {
            when (event) {
              DJISDKInitEvent.INITIALIZE_COMPLETE -> {
                // SDK initialization completed, now register the app
                SDKManager.getInstance().registerApp()
              }
              else -> {
                // Log other init events for debugging
                sendEvent("onSDKInitProgress", mapOf(
                  "event" to event.name,
                  "progress" to totalProcess
                ))
              }
            }
          }

          override fun onDatabaseDownloadProgress(current: Long, total: Long) {
            sendEvent("onDatabaseDownloadProgress", mapOf(
              "current" to current,
              "total" to total,
              "progress" to if (total > 0) (current.toDouble() / total.toDouble() * 100).toInt() else 0
            ))
          }
        })
      } catch (e: Exception) {
        promise.reject("INIT_ERROR", "Failed to initialize SDK: ${e.message}", e)
      }
    }

    AsyncFunction("isDroneConnected") { promise: Promise ->
      try {
        val sdkRegistered = SDKManager.getInstance().isRegistered
        val isConnected = sdkRegistered && isProductConnected
        
        promise.resolve(mapOf(
          "connected" to isConnected,
          "sdkRegistered" to sdkRegistered,
          "productConnected" to isProductConnected,
          "productType" to "UNKNOWN"
        ))
      } catch (e: Exception) {
        promise.reject("CONNECTION_CHECK_ERROR", "Failed to check drone connection: ${e.message}", e)
      }
    }

    AsyncFunction("getDroneInfo") { promise: Promise ->
      try {
        getDroneBasicInfo()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("INFO_ERROR", "Failed to get drone info: ${e.message}", e)
      }
    }

    AsyncFunction("enableVirtualStick") { promise: Promise ->
      try {
        VirtualStickManager.getInstance().enableVirtualStick(object : CommonCallbacks.CompletionCallback {
          override fun onSuccess() {
            promise.resolve(mapOf("success" to true))
          }
          
          override fun onFailure(error: IDJIError) {
            promise.reject("VIRTUAL_STICK_ERROR", "Failed to enable virtual stick: ${error.description()}", null)
          }
        })
      } catch (e: Exception) {
        promise.reject("VIRTUAL_STICK_ERROR", "Failed to enable virtual stick: ${e.message}", e)
      }
    }

    AsyncFunction("disableVirtualStick") { promise: Promise ->
      try {
        VirtualStickManager.getInstance().disableVirtualStick(object : CommonCallbacks.CompletionCallback {
          override fun onSuccess() {
            promise.resolve(mapOf("success" to true))
          }
          
          override fun onFailure(error: IDJIError) {
            promise.reject("VIRTUAL_STICK_ERROR", "Failed to disable virtual stick: ${error.description()}", null)
          }
        })
      } catch (e: Exception) {
        promise.reject("VIRTUAL_STICK_ERROR", "Failed to disable virtual stick: ${e.message}", e)
      }
    }

    AsyncFunction("getVirtualStickState") { promise: Promise ->
      try {
        val state = currentVirtualStickState
        if (state != null) {
          promise.resolve(mapOf(
            "isVirtualStickEnabled" to state.isVirtualStickEnable,
            "currentFlightControlAuthorityOwner" to state.currentFlightControlAuthorityOwner.name,
            "isVirtualStickAdvancedModeEnabled" to state.isVirtualStickAdvancedModeEnabled
          ))
        } else {
          promise.resolve(mapOf(
            "isVirtualStickEnabled" to false,
            "currentFlightControlAuthorityOwner" to "UNKNOWN",
            "isVirtualStickAdvancedModeEnabled" to false
          ))
        }
      } catch (e: Exception) {
        promise.reject("VIRTUAL_STICK_STATE_ERROR", "Failed to get virtual stick state: ${e.message}", e)
      }
    }

    AsyncFunction("getDetailedDroneInfo") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        val productInfo = mutableMapOf<String, Any?>()
        
        // Get product type
        ProductKey.KeyProductType.create().get(
          onSuccess = { productType ->
            productInfo["productType"] = productType?.name ?: "UNKNOWN"
            
            // Get firmware version
            ProductKey.KeyFirmwareVersion.create().get(
              onSuccess = { firmwareVersion ->
                productInfo["firmwareVersion"] = firmwareVersion ?: "UNKNOWN"
                
                // Get serial number
                FlightControllerKey.KeySerialNumber.create().get(
                  onSuccess = { serialNumber ->
                    productInfo["serialNumber"] = serialNumber ?: "UNKNOWN"
                    
                    // Get additional info
                    productInfo["productId"] = currentProductId
                    productInfo["sdkVersion"] = SDKManager.getInstance().sdkVersion
                    productInfo["isRegistered"] = SDKManager.getInstance().isRegistered
                    productInfo["isConnected"] = isProductConnected
                    
                    promise.resolve(productInfo)
                  },
                  onFailure = { error ->
                    productInfo["serialNumber"] = "UNAVAILABLE"
                    productInfo["productId"] = currentProductId
                    productInfo["sdkVersion"] = SDKManager.getInstance().sdkVersion
                    productInfo["isRegistered"] = SDKManager.getInstance().isRegistered
                    productInfo["isConnected"] = isProductConnected
                    
                    promise.resolve(productInfo)
                  }
                )
              },
              onFailure = { error ->
                productInfo["firmwareVersion"] = "UNAVAILABLE"
                productInfo["serialNumber"] = "UNAVAILABLE"
                productInfo["productId"] = currentProductId
                productInfo["sdkVersion"] = SDKManager.getInstance().sdkVersion
                productInfo["isRegistered"] = SDKManager.getInstance().isRegistered
                productInfo["isConnected"] = isProductConnected
                
                promise.resolve(productInfo)
              }
            )
          },
          onFailure = { error ->
            productInfo["productType"] = "UNAVAILABLE"
            productInfo["firmwareVersion"] = "UNAVAILABLE"
            productInfo["serialNumber"] = "UNAVAILABLE"
            productInfo["productId"] = currentProductId
            productInfo["sdkVersion"] = SDKManager.getInstance().sdkVersion
            productInfo["isRegistered"] = SDKManager.getInstance().isRegistered
            productInfo["isConnected"] = isProductConnected
            
            promise.resolve(productInfo)
          }
        )
      } catch (e: Exception) {
        promise.reject("PRODUCT_INFO_ERROR", "Failed to get product info: ${e.message}", e)
      }
    }

    // Camera Stream Methods
    AsyncFunction("getAvailableCameras") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.resolve(emptyList<Map<String, Any>>())
          return@AsyncFunction
        }

        val availableCameras = mutableListOf<Map<String, Any>>()
        
        // Get available camera list from camera stream manager
        // This would typically come from a listener, but we'll check common camera indices
        val cameraIndices = listOf<Pair<ComponentIndexType, String>>(
          Pair(ComponentIndexType.LEFT_OR_MAIN, "Main Camera"),
          Pair(ComponentIndexType.RIGHT, "Right Camera"), 
          Pair(ComponentIndexType.FPV, "FPV Camera")
        )

        for ((index, name) in cameraIndices) {
          try {
            // Try to access camera stream info to check if available
            val streamInfo = cameraStreamManager.getAircraftStreamFrameInfo(index)
            if (streamInfo != null) {
              availableCameras.add(mapOf(
                "value" to index.ordinal,
                "name" to name
              ))
            }
          } catch (e: Exception) {
            // Camera not available, skip
          }
        }

        promise.resolve(availableCameras)
      } catch (e: Exception) {
        promise.reject("CAMERA_LIST_ERROR", "Failed to get available cameras: ${e.message}", e)
      }
    }

    AsyncFunction("enableCameraStream") { cameraIndex: Int, promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        val componentIndex = ComponentIndexType.find(cameraIndex)
        Log.d(TAG, "Enabling camera stream for index: $cameraIndex ($componentIndex)")

        try {
          cameraStreamManager.enableStream(componentIndex, true)
          
          promise.resolve(mapOf(
            "success" to true,
            "message" to "Camera stream enabled successfully"
          ))
          
          // Send status update event
          sendEvent("onCameraStreamStatusChange", mapOf(
            "isAvailable" to true,
            "isEnabled" to true,
            "streamInfo" to getCameraStreamInfoMap(componentIndex)
          ))
        } catch (e: Exception) {
          promise.resolve(mapOf(
            "success" to false,
            "message" to "Failed to enable camera stream: ${e.message}"
          ))
        }
      } catch (e: Exception) {
        promise.reject("CAMERA_STREAM_ERROR", "Failed to enable camera stream: ${e.message}", e)
      }
    }

    AsyncFunction("disableCameraStream") { cameraIndex: Int, promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        val componentIndex = ComponentIndexType.find(cameraIndex)
        Log.d(TAG, "Disabling camera stream for index: $cameraIndex ($componentIndex)")

        try {
          cameraStreamManager.enableStream(componentIndex, false)
          
          // Remove surface if exists
          currentCameraSurfaces[cameraIndex]?.let { surface ->
            cameraStreamManager.removeCameraStreamSurface(surface)
            currentCameraSurfaces.remove(cameraIndex)
          }
          
          promise.resolve(mapOf(
            "success" to true,
            "message" to "Camera stream disabled successfully"
          ))
          
          // Send status update event
          sendEvent("onCameraStreamStatusChange", mapOf(
            "isAvailable" to true,
            "isEnabled" to false
          ))
        } catch (e: Exception) {
          promise.resolve(mapOf(
            "success" to false,
            "message" to "Failed to disable camera stream: ${e.message}"
          ))
        }
      } catch (e: Exception) {
        promise.reject("CAMERA_STREAM_ERROR", "Failed to disable camera stream: ${e.message}", e)
      }
    }

    AsyncFunction("getCameraStreamStatus") { cameraIndex: Int, promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.resolve(mapOf(
            "isAvailable" to false,
            "isEnabled" to false,
            "error" to "No drone connected"
          ))
          return@AsyncFunction
        }

        val componentIndex = ComponentIndexType.find(cameraIndex)
        val streamInfo = getCameraStreamInfoMap(componentIndex)
        
        promise.resolve(mapOf(
          "isAvailable" to (streamInfo != null),
          "isEnabled" to currentCameraSurfaces.containsKey(cameraIndex),
          "streamInfo" to streamInfo
        ))
      } catch (e: Exception) {
        promise.reject("CAMERA_STATUS_ERROR", "Failed to get camera stream status: ${e.message}", e)
      }
    }

    AsyncFunction("getCameraStreamInfo") { cameraIndex: Int, promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        val componentIndex = ComponentIndexType.find(cameraIndex)
        val streamInfo = getCameraStreamInfoMap(componentIndex)
        
        if (streamInfo != null) {
          promise.resolve(streamInfo)
        } else {
          promise.reject("NO_STREAM_INFO", "No stream info available for camera $cameraIndex", null)
        }
      } catch (e: Exception) {
        promise.reject("CAMERA_INFO_ERROR", "Failed to get camera stream info: ${e.message}", e)
      }
    }

    // Virtual Stick Control Methods
    AsyncFunction("sendVirtualStickCommand") { leftX: Double, leftY: Double, rightX: Double, rightY: Double, promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        // Convert -1.0 to 1.0 range to stick position values
        // Based on DJI sample: OnScreenJoystick provides values between -1 and 1
        // Apply deviation threshold (DJI sample uses 0.02 threshold)
        val deviation = 0.02
        
        var adjustedLeftX = if (kotlin.math.abs(leftX) >= deviation) leftX else 0.0
        var adjustedLeftY = if (kotlin.math.abs(leftY) >= deviation) leftY else 0.0
        var adjustedRightX = if (kotlin.math.abs(rightX) >= deviation) rightX else 0.0
        var adjustedRightY = if (kotlin.math.abs(rightY) >= deviation) rightY else 0.0
        
        // Use DJI SDK's MAX_STICK_POSITION_ABS constant (typically 660)
        val maxStickPosition = 660 // Stick.MAX_STICK_POSITION_ABS equivalent
        
        val leftHorizontal = (adjustedLeftX * maxStickPosition).toInt()  // Yaw
        val leftVertical = (adjustedLeftY * maxStickPosition).toInt()    // Throttle  
        val rightHorizontal = (adjustedRightX * maxStickPosition).toInt() // Roll
        val rightVertical = (adjustedRightY * maxStickPosition).toInt()   // Pitch

        Log.d(TAG, "Sending virtual stick command: LH=$leftHorizontal, LV=$leftVertical, RH=$rightHorizontal, RV=$rightVertical")
        
        // Check virtual stick state before sending commands (simplified check)
        try {
          // Basic validation - if VirtualStickManager throws exception, virtual stick is not ready
          val manager = VirtualStickManager.getInstance()
          Log.d(TAG, "Virtual Stick Manager accessed successfully, sending stick positions")
        } catch (e: Exception) {
          Log.w(TAG, "Virtual stick manager not available: ${e.message}")
          promise.reject("VIRTUAL_STICK_NOT_READY", "Virtual stick not ready: ${e.message}", null)
          return@AsyncFunction
        }

        // Set stick positions using the DJI SDK method (same as DJI sample)
        VirtualStickManager.getInstance().leftStick.horizontalPosition = leftHorizontal
        VirtualStickManager.getInstance().leftStick.verticalPosition = leftVertical
        VirtualStickManager.getInstance().rightStick.horizontalPosition = rightHorizontal
        VirtualStickManager.getInstance().rightStick.verticalPosition = rightVertical
        
        // ALSO send advanced parameters with current stick values (this might be the missing piece)
        try {
          val param = VirtualStickFlightControlParam().apply {
            // Use the normalized values for advanced parameters (Double type required)
            roll = adjustedRightX    // Right stick X
            pitch = adjustedRightY   // Right stick Y  
            yaw = adjustedLeftX      // Left stick X
            verticalThrottle = adjustedLeftY // Left stick Y (correct property name)
            
            // Same configuration as during enable
            rollPitchCoordinateSystem = FlightCoordinateSystem.BODY
            verticalControlMode = VerticalControlMode.VELOCITY
            yawControlMode = YawControlMode.ANGULAR_VELOCITY
            rollPitchControlMode = RollPitchControlMode.ANGLE
          }
          
          VirtualStickManager.getInstance().sendVirtualStickAdvancedParam(param)
          Log.d(TAG, "Advanced param sent: roll=${param.roll}, pitch=${param.pitch}, yaw=${param.yaw}, verticalThrottle=${param.verticalThrottle}")
        } catch (e: Exception) {
          Log.w(TAG, "Failed to send advanced param: ${e.message}")
        }

        promise.resolve(mapOf("success" to true))
      } catch (e: Exception) {
        Log.e(TAG, "Failed to send virtual stick command: ${e.message}", e)
        promise.reject("VIRTUAL_STICK_COMMAND_ERROR", "Failed to send virtual stick command: ${e.message}", e)
      }
    }

    AsyncFunction("setVirtualStickModeEnabled") { enabled: Boolean, promise: Promise ->
      try {
        if (enabled) {
          VirtualStickManager.getInstance().enableVirtualStick(object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
              try {
                // Set speed level (based on DJI sample)
                VirtualStickManager.getInstance().speedLevel = 1.0
                
                // Enable advanced mode for better control
                VirtualStickManager.getInstance().setVirtualStickAdvancedModeEnabled(true)
                
                // Configure virtual stick parameters (based on DJI sample)
                val param = VirtualStickFlightControlParam().apply {
                  rollPitchCoordinateSystem = FlightCoordinateSystem.BODY
                  verticalControlMode = VerticalControlMode.VELOCITY
                  yawControlMode = YawControlMode.ANGULAR_VELOCITY
                  rollPitchControlMode = RollPitchControlMode.ANGLE
                }
                
                VirtualStickManager.getInstance().sendVirtualStickAdvancedParam(param)
                
                Log.d(TAG, "Virtual stick enabled with advanced configuration")
                promise.resolve(mapOf("success" to true, "enabled" to true))
              } catch (e: Exception) {
                Log.e(TAG, "Failed to configure virtual stick: ${e.message}", e)
                promise.reject("VIRTUAL_STICK_CONFIG_ERROR", "Failed to configure virtual stick: ${e.message}", null)
              }
            }
            
            override fun onFailure(error: IDJIError) {
              Log.e(TAG, "Failed to enable virtual stick: ${error.toString()}")
              promise.reject("VIRTUAL_STICK_ERROR", "Failed to enable virtual stick: ${error.toString()}", null)
            }
          })
        } else {
          VirtualStickManager.getInstance().disableVirtualStick(object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
              // Disable advanced mode
              VirtualStickManager.getInstance().setVirtualStickAdvancedModeEnabled(false)
              Log.d(TAG, "Virtual stick disabled")
              promise.resolve(mapOf("success" to true, "enabled" to false))
            }
            
            override fun onFailure(error: IDJIError) {
              Log.e(TAG, "Failed to disable virtual stick: ${error.toString()}")
              promise.reject("VIRTUAL_STICK_ERROR", "Failed to disable virtual stick: ${error.toString()}", null)
            }
          })
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to set virtual stick mode: ${e.message}", e)
        promise.reject("VIRTUAL_STICK_ERROR", "Failed to set virtual stick mode: ${e.message}", e)
      }
    }

    // Add method to check virtual stick status
    AsyncFunction("getVirtualStickStatus") { promise: Promise ->
      try {
        val manager = VirtualStickManager.getInstance()
        
        // Try to get current virtual stick information
        val result = mapOf(
          "speedLevel" to manager.speedLevel,
          "note" to "For virtual stick to work, drone usually needs to be flying or motors started. Check logs for detailed state info.",
          "suggestion" to "1. Enable takeoff, 2. Start motors or takeoff, 3. Then try virtual stick"
        )
        
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("VIRTUAL_STICK_STATUS_ERROR", "Failed to get virtual stick status: ${e.message}", e)
      }
    }

    AsyncFunction("setVirtualStickControlMode") { 
      rollPitchMode: String, 
      yawMode: String, 
      verticalMode: String, 
      coordinateSystem: String, 
      promise: Promise ->
      try {
        val rollPitchControlMode = when(rollPitchMode.uppercase()) {
          "VELOCITY" -> RollPitchControlMode.VELOCITY
          "ANGLE" -> RollPitchControlMode.ANGLE
          else -> RollPitchControlMode.VELOCITY
        }

        val yawControlMode = when(yawMode.uppercase()) {
          "ANGLE" -> YawControlMode.ANGLE
          "ANGULAR_VELOCITY" -> YawControlMode.ANGULAR_VELOCITY
          else -> YawControlMode.ANGULAR_VELOCITY
        }

        val verticalControlMode = when(verticalMode.uppercase()) {
          "VELOCITY" -> VerticalControlMode.VELOCITY
          "POSITION" -> VerticalControlMode.POSITION
          else -> VerticalControlMode.VELOCITY
        }

        val flightCoordinateSystem = when(coordinateSystem.uppercase()) {
          "GROUND" -> FlightCoordinateSystem.GROUND
          "BODY" -> FlightCoordinateSystem.BODY
          else -> FlightCoordinateSystem.GROUND
        }

        // Configure the virtual stick parameters
        val param = VirtualStickFlightControlParam().apply {
          this.rollPitchControlMode = rollPitchControlMode
          this.yawControlMode = yawControlMode
          this.verticalControlMode = verticalControlMode
          this.rollPitchCoordinateSystem = flightCoordinateSystem
        }

        // Store the configuration for later use
        VirtualStickManager.getInstance().sendVirtualStickAdvancedParam(param)
        promise.resolve(mapOf("success" to true, "configured" to true))

      } catch (e: Exception) {
        promise.reject("CONTROL_MODE_ERROR", "Failed to set virtual stick control modes: ${e.message}", e)
      }
    }

    // Takeoff and Landing Methods
    AsyncFunction("startTakeoff") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        FlightControllerKey.KeyStartTakeoff.create().action(
          onSuccess = { result: EmptyMsg ->
            sendEvent("onTakeoffResult", mapOf(
              "success" to true,
              "message" to "Takeoff started successfully"
            ))
            promise.resolve(mapOf("success" to true, "message" to "Takeoff started"))
          },
          onFailure = { error: IDJIError ->
            sendEvent("onTakeoffResult", mapOf(
              "success" to false,
              "error" to error.toString()
            ))
            promise.reject("TAKEOFF_ERROR", "Failed to start takeoff: ${error.toString()}", null)
          }
        )
      } catch (e: Exception) {
        promise.reject("TAKEOFF_ERROR", "Failed to start takeoff: ${e.message}", e)
      }
    }

    AsyncFunction("startLanding") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        FlightControllerKey.KeyStartAutoLanding.create().action(
          onSuccess = { result: EmptyMsg ->
            sendEvent("onLandingResult", mapOf(
              "success" to true,
              "message" to "Landing started successfully"
            ))
            promise.resolve(mapOf("success" to true, "message" to "Landing started"))
          },
          onFailure = { error: IDJIError ->
            sendEvent("onLandingResult", mapOf(
              "success" to false,
              "error" to error.toString()
            ))
            promise.reject("LANDING_ERROR", "Failed to start landing: ${error.toString()}", null)
          }
        )
      } catch (e: Exception) {
        promise.reject("LANDING_ERROR", "Failed to start landing: ${e.message}", e)
      }
    }

    AsyncFunction("cancelLanding") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        FlightControllerKey.KeyStopAutoLanding.create().action(
          onSuccess = { result: EmptyMsg ->
            promise.resolve(mapOf("success" to true, "message" to "Landing cancelled"))
          },
          onFailure = { error: IDJIError ->
            promise.reject("CANCEL_LANDING_ERROR", "Failed to cancel landing: ${error.toString()}", null)
          }
        )
      } catch (e: Exception) {
        promise.reject("CANCEL_LANDING_ERROR", "Failed to cancel landing: ${e.message}", e)
      }
    }

    AsyncFunction("confirmLanding") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }
        FlightControllerKey.KeyConfirmLanding.create().action(
          onSuccess = { result: EmptyMsg ->
            sendEvent("onLandingResult", mapOf(
              "success" to true,
              "message" to "Landing confirmed successfully"
            ))
            promise.resolve(mapOf("success" to true, "message" to "Landing confirmed"))
          },
          onFailure = { error: IDJIError ->
            sendEvent("onLandingResult", mapOf(
              "success" to false,
              "error" to error.toString()
            ))
            promise.reject("CONFIRM_LANDING_ERROR", "Failed to confirm landing: ${error.toString()}", null)
          }
        )
      } catch (e: Exception) {
        promise.reject("CONFIRM_LANDING_ERROR", "Failed to confirm landing: ${e.message}", e)
      }
    }

    AsyncFunction("isLandingConfirmationNeeded") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }
        
        val isNeeded = FlightControllerKey.KeyIsLandingConfirmationNeeded.create().get(false)
        promise.resolve(mapOf(
          "isNeeded" to isNeeded,
          "success" to true
        ))
      } catch (e: Exception) {
        Log.e(TAG, "Failed to check landing confirmation status: ${e.message}", e)
        promise.resolve(mapOf(
          "isNeeded" to false,
          "success" to false,
          "error" to "Failed to check landing confirmation: ${e.message}"
        ))
      }
    }

    // Flight Status and Readiness Checks
    AsyncFunction("getFlightStatus") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        val flightStatus = mutableMapOf<String, Any?>()

        // Check connection status
        FlightControllerKey.KeyConnection.create().get(
          onSuccess = { isConnected ->
            flightStatus["isConnected"] = isConnected ?: false
            
            // Check if motors are on
            FlightControllerKey.KeyAreMotorsOn.create().get(
              onSuccess = { motorsOn ->
                flightStatus["areMotorsOn"] = motorsOn ?: false
                
                // Check if flying
                FlightControllerKey.KeyIsFlying.create().get(
                  onSuccess = { isFlying ->
                    flightStatus["isFlying"] = isFlying ?: false
                    
                    // Get flight mode
                    FlightControllerKey.KeyFlightModeString.create().get(
                      onSuccess = { flightMode ->
                        flightStatus["flightMode"] = flightMode ?: "UNKNOWN"
                        promise.resolve(flightStatus)
                      },
                      onFailure = { error ->
                        flightStatus["flightMode"] = "UNKNOWN"
                        promise.resolve(flightStatus)
                      }
                    )
                  },
                  onFailure = { error ->
                    flightStatus["isFlying"] = false
                    flightStatus["flightMode"] = "UNKNOWN"
                    promise.resolve(flightStatus)
                  }
                )
              },
              onFailure = { error ->
                flightStatus["areMotorsOn"] = false
                flightStatus["isFlying"] = false
                flightStatus["flightMode"] = "UNKNOWN"
                promise.resolve(flightStatus)
              }
            )
          },
          onFailure = { error ->
            promise.reject("FLIGHT_STATUS_ERROR", "Failed to get flight status: ${error.toString()}", null)
          }
        )
      } catch (e: Exception) {
        promise.reject("FLIGHT_STATUS_ERROR", "Failed to get flight status: ${e.message}", e)
      }
    }

    AsyncFunction("isReadyForTakeoff") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.resolve(mapOf(
            "ready" to false,
            "reason" to "No drone connected"
          ))
          return@AsyncFunction
        }

        // Check multiple conditions for takeoff readiness
        FlightControllerKey.KeyConnection.create().get(
          onSuccess = { isConnected ->
            if (isConnected != true) {
              promise.resolve(mapOf("ready" to false, "reason" to "Flight controller not connected"))
              return@get
            }

            FlightControllerKey.KeyAreMotorsOn.create().get(
              onSuccess = { motorsOn ->
                if (motorsOn == true) {
                  promise.resolve(mapOf("ready" to false, "reason" to "Motors are already running"))
                  return@get
                }

                FlightControllerKey.KeyIsFlying.create().get(
                  onSuccess = { isFlying ->
                    if (isFlying == true) {
                      promise.resolve(mapOf("ready" to false, "reason" to "Aircraft is already flying"))
                      return@get
                    }

                    // All checks passed
                    promise.resolve(mapOf(
                      "ready" to true,
                      "reason" to "Ready for takeoff"
                    ))
                  },
                  onFailure = { error ->
                    promise.resolve(mapOf("ready" to false, "reason" to "Cannot determine flying status"))
                  }
                )
              },
              onFailure = { error ->
                promise.resolve(mapOf("ready" to false, "reason" to "Cannot determine motor status"))
              }
            )
          },
          onFailure = { error ->
            promise.resolve(mapOf("ready" to false, "reason" to "Flight controller connection check failed"))
          }
        )
      } catch (e: Exception) {
        promise.reject("READINESS_CHECK_ERROR", "Failed to check takeoff readiness: ${e.message}", e)
      }
    }

    AsyncFunction("startCompassCalibration") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        FlightControllerKey.KeyStartCompassCalibration.create().action(
          onSuccess = { result: EmptyMsg ->
            promise.resolve(mapOf("success" to true, "message" to "Compass calibration started"))
          },
          onFailure = { error: IDJIError ->
            promise.reject("CALIBRATION_ERROR", "Failed to start compass calibration: ${error.toString()}", null)
          }
        )
      } catch (e: Exception) {
        promise.reject("CALIBRATION_ERROR", "Failed to start compass calibration: ${e.message}", e)
      }
    }

    AsyncFunction("getCompassCalibrationStatus") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        FlightControllerKey.KeyCompassCalibrationStatus.create().get(
          onSuccess = { status ->
            promise.resolve(mapOf(
              "status" to (status?.name ?: "UNKNOWN"),
              "description" to getCompassCalibrationDescription(status?.name ?: "UNKNOWN")
            ))
          },
          onFailure = { error ->
            promise.reject("CALIBRATION_STATUS_ERROR", "Failed to get compass calibration status: ${error.toString()}", null)
          }
        )
      } catch (e: Exception) {
        promise.reject("CALIBRATION_STATUS_ERROR", "Failed to get compass calibration status: ${e.message}", e)
      }
    }

    AsyncFunction("getAltitude") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        FlightControllerKey.KeyAltitude.create().get(
          onSuccess = { altitude ->
            promise.resolve(mapOf(
              "altitude" to (altitude ?: 0.0),
              "unit" to "meters"
            ))
          },
          onFailure = { error ->
            promise.reject("ALTITUDE_ERROR", "Failed to get altitude: ${error.toString()}", null)
          }
        )
      } catch (e: Exception) {
        promise.reject("ALTITUDE_ERROR", "Failed to get altitude: ${e.message}", e)
      }
    }

    // Get complete GPS location data (LocationCoordinate3D)
    AsyncFunction("getGPSLocation") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }
        
        // Get aircraft location using FlightControllerKey - use the synchronous method like in DJI sample
        try {
          val location = FlightControllerKey.KeyAircraftLocation3D.create().get(LocationCoordinate3D())
          if (location != null) {
            promise.resolve(mapOf(
              "latitude" to location.latitude,
              "longitude" to location.longitude,
              "altitude" to location.altitude,
              "isValid" to true
            ))
          } else {
            promise.resolve(mapOf(
              "latitude" to 0.0,
              "longitude" to 0.0,
              "altitude" to 0.0,
              "isValid" to false,
              "error" to "Location data not available"
            ))
          }
        } catch (e: Exception) {
          Log.e(TAG, "Failed to get GPS location: ${e.message}", e)
          promise.resolve(mapOf(
            "latitude" to 0.0,
            "longitude" to 0.0,
            "altitude" to 0.0,
            "isValid" to false,
            "error" to "GPS location error: ${e.message}"
          ))
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to get GPS location: ${e.message}", e)
        promise.reject("GPS_LOCATION_ERROR", "Failed to get GPS location: ${e.message}", e)
      }
    }

    // Intelligent Flight - FlyTo Mission
    AsyncFunction("startFlyToMission") { latitude: Double, longitude: Double, altitude: Double, maxSpeed: Int, promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }
        
        val target = FlyToTarget()
        target.targetLocation = LocationCoordinate3D(latitude, longitude, altitude)
        target.maxSpeed = maxSpeed
        target.securityTakeoffHeight = 20 // Default security takeoff height
        
        IntelligentFlightManager.getInstance().flyToMissionManager.startMission(target, null,
          object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
              Log.i(TAG, "FlyTo mission started successfully")
              promise.resolve(mapOf(
                "success" to true,
                "message" to "FlyTo mission started successfully"
              ))
            }
            override fun onFailure(error: IDJIError) {
              Log.e(TAG, "Failed to start FlyTo mission: ${error}")
              promise.reject("FLYTO_START_ERROR", "Failed to start FlyTo mission: ${error}", null)
            }
          })
      } catch (e: Exception) {
        Log.e(TAG, "Failed to start FlyTo mission: ${e.message}", e)
        promise.reject("FLYTO_START_ERROR", "Failed to start FlyTo mission: ${e.message}", e)
      }
    }

    AsyncFunction("stopFlyToMission") { promise: Promise ->
      try {
        IntelligentFlightManager.getInstance().flyToMissionManager.stopMission(
          object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
              Log.i(TAG, "FlyTo mission stopped successfully")
              promise.resolve(mapOf(
                "success" to true,
                "message" to "FlyTo mission stopped successfully"
              ))
            }
            override fun onFailure(error: IDJIError) {
              Log.e(TAG, "Failed to stop FlyTo mission: ${error}")
              promise.reject("FLYTO_STOP_ERROR", "Failed to stop FlyTo mission: ${error}", null)
            }
          })
      } catch (e: Exception) {
        Log.e(TAG, "Failed to stop FlyTo mission: ${e.message}", e)
        promise.reject("FLYTO_STOP_ERROR", "Failed to stop FlyTo mission: ${e.message}", e)
      }
    }

    AsyncFunction("getFlyToMissionInfo") { promise: Promise ->
      try {
        val flyToManager = IntelligentFlightManager.getInstance().flyToMissionManager
        
        // Create a basic status response since flyToInfo might not be directly accessible
        promise.resolve(mapOf<String, Any?>(
          "isRunning" to true, // We'll assume it's running if we can get the manager
          "currentSpeed" to 0.0,
          "targetLocation" to null,
          "distanceToTarget" to 0.0
        ))
      } catch (e: Exception) {
        Log.e(TAG, "Failed to get FlyTo mission info: ${e.message}", e)
        promise.resolve(mapOf<String, Any?>(
          "isRunning" to false,
          "currentSpeed" to 0.0,
          "targetLocation" to null,
          "distanceToTarget" to 0.0
        ))
      }
    }

    // Waypoint Mission Functions
    AsyncFunction("isWaypointMissionSupported") { promise: Promise ->
      try {
        // Waypoint missions are supported if WaypointMissionManager is available
        // We'll initialize the state listener here
        setupWaypointMissionStateListener()
        
        val isSupported = true // WaypointMissionManager exists, so supported
        val stateString = currentWaypointMissionState?.name ?: "UNKNOWN"
        
        promise.resolve(mapOf(
          "isSupported" to isSupported,
          "success" to true,
          "state" to stateString
        ))
      } catch (e: Exception) {
        Log.e(TAG, "Failed to check waypoint support: ${e.message}", e)
        promise.resolve(mapOf(
          "isSupported" to false,
          "success" to false,
          "error" to "Failed to check waypoint support: ${e.message}"
        ))
      }
    }

    AsyncFunction("getWaypointMissionState") { promise: Promise ->
      try {
        val stateString = currentWaypointMissionState?.name ?: "UNKNOWN"
        promise.resolve(mapOf(
          "state" to stateString,
          "success" to true
        ))
      } catch (e: Exception) {
        Log.e(TAG, "Failed to get waypoint mission state: ${e.message}", e)
        promise.resolve(mapOf(
          "state" to "UNKNOWN",
          "success" to false,
          "error" to "Failed to get mission state: ${e.message}"
        ))
      }
    }

    AsyncFunction("loadWaypointMissionFromKML") { filePath: String, promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.resolve(mapOf(
            "success" to false,
            "error" to "No drone connected"
          ))
          return@AsyncFunction
        }

        // Initialize waypoint directories and WPMZ manager
        initializeWaypointMission()
        
        // Validate and process the file
        val processedFilePath = processWaypointFile(filePath)
        if (processedFilePath.isEmpty()) {
          promise.resolve(mapOf(
            "success" to false,
            "error" to "Invalid file format. Please select a .kmz or .kml file"
          ))
          return@AsyncFunction
        }
        
        // Check if file exists
        val file = File(processedFilePath)
        if (!file.exists()) {
          promise.resolve(mapOf(
            "success" to false,
            "error" to "File not found: $processedFilePath"
          ))
          return@AsyncFunction
        }
        
        Log.d(TAG, "Uploading waypoint mission file: $processedFilePath")
        
        // Use WaypointMissionManager to upload KMZ file to aircraft
        WaypointMissionManager.getInstance().pushKMZFileToAircraft(
          processedFilePath,
          object : CommonCallbacks.CompletionCallbackWithProgress<Double> {
            override fun onProgressUpdate(progress: Double) {
              Log.d(TAG, "Upload progress: ${(progress * 100).toInt()}%")
            }

            override fun onSuccess() {
              Log.i(TAG, "KMZ file uploaded successfully")
              try {
                // Get available wayline IDs from the uploaded file
                val waylineIDs = WaypointMissionManager.getInstance().getAvailableWaylineIDs(processedFilePath)
                promise.resolve(mapOf(
                  "success" to true,
                  "message" to "Waypoint mission uploaded successfully",
                  "waypointCount" to waylineIDs.size,
                  "waylineIDs" to waylineIDs,
                  "filePath" to processedFilePath
                ))
              } catch (e: Exception) {
                Log.w(TAG, "Could not get wayline IDs: ${e.message}")
                promise.resolve(mapOf(
                  "success" to true,
                  "message" to "Mission uploaded but could not get wayline count",
                  "waypointCount" to 0,
                  "filePath" to processedFilePath
                ))
              }
            }

            override fun onFailure(error: IDJIError) {
              Log.e(TAG, "Failed to upload waypoint mission: ${error.description()}")
              promise.resolve(mapOf(
                "success" to false,
                "error" to "Failed to upload waypoint mission: ${error.description()}"
              ))
            }
          }
        )
      } catch (e: Exception) {
        Log.e(TAG, "Failed to load waypoint mission: ${e.message}", e)
        promise.resolve(mapOf(
          "success" to false,
          "error" to "Failed to load waypoint mission: ${e.message}"
        ))
      }
    }

    AsyncFunction("startWaypointMission") { missionFileName: String?, promise: Promise ->
      try {
        if (missionFileName.isNullOrEmpty()) {
          promise.resolve(mapOf(
            "success" to false,
            "error" to "Mission file name is required"
          ))
          return@AsyncFunction
        }

        // Get available wayline IDs for the mission
        val availableWaylineIDs = try {
          WaypointMissionManager.getInstance().getAvailableWaylineIDs(missionFileName)
        } catch (e: Exception) {
          Log.e(TAG, "Failed to get wayline IDs: ${e.message}")
          emptyList<Int>()
        }

        WaypointMissionManager.getInstance().startMission(
          missionFileName,
          availableWaylineIDs,
          object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
              Log.i(TAG, "Waypoint mission started successfully")
              promise.resolve(mapOf(
                "success" to true,
                "message" to "Waypoint mission started successfully"
              ))
            }

            override fun onFailure(error: IDJIError) {
              Log.e(TAG, "Failed to start waypoint mission: ${error.description()}")
              promise.resolve(mapOf(
                "success" to false,
                "error" to "Failed to start waypoint mission: ${error.description()}"
              ))
            }
          }
        )
      } catch (e: Exception) {
        Log.e(TAG, "Failed to start waypoint mission: ${e.message}", e)
        promise.resolve(mapOf(
          "success" to false,
          "error" to "Failed to start waypoint mission: ${e.message}"
        ))
      }
    }

    AsyncFunction("stopWaypointMission") { missionFileName: String?, promise: Promise ->
      try {
        if (missionFileName.isNullOrEmpty()) {
          promise.resolve(mapOf(
            "success" to false,
            "error" to "Mission file name is required"
          ))
          return@AsyncFunction
        }

        WaypointMissionManager.getInstance().stopMission(
          missionFileName,
          object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
              Log.i(TAG, "Waypoint mission stopped successfully")
              promise.resolve(mapOf(
                "success" to true,
                "message" to "Waypoint mission stopped successfully"
              ))
            }

            override fun onFailure(error: IDJIError) {
              Log.e(TAG, "Failed to stop waypoint mission: ${error.description()}")
              promise.resolve(mapOf(
                "success" to false,
                "error" to "Failed to stop waypoint mission: ${error.description()}"
              ))
            }
          }
        )
      } catch (e: Exception) {
        Log.e(TAG, "Failed to stop waypoint mission: ${e.message}", e)
        promise.resolve(mapOf(
          "success" to false,
          "error" to "Failed to stop waypoint mission: ${e.message}"
        ))
      }
    }

    AsyncFunction("pauseWaypointMission") { promise: Promise ->
      try {
        WaypointMissionManager.getInstance().pauseMission(
          object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
              Log.i(TAG, "Waypoint mission paused successfully")
              promise.resolve(mapOf(
                "success" to true,
                "message" to "Waypoint mission paused successfully"
              ))
            }

            override fun onFailure(error: IDJIError) {
              Log.e(TAG, "Failed to pause waypoint mission: ${error}")
              promise.reject("WAYPOINT_PAUSE_ERROR", "Failed to pause waypoint mission: ${error}", null)
            }
          })
      } catch (e: Exception) {
        Log.e(TAG, "Failed to pause waypoint mission: ${e.message}", e)
        promise.reject("WAYPOINT_PAUSE_ERROR", "Failed to pause waypoint mission: ${e.message}", e)
      }
    }

    AsyncFunction("resumeWaypointMission") { promise: Promise ->
      try {
        WaypointMissionManager.getInstance().resumeMission(
          object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
              Log.i(TAG, "Waypoint mission resumed successfully")
              promise.resolve(mapOf(
                "success" to true,
                "message" to "Waypoint mission resumed successfully"
              ))
            }

            override fun onFailure(error: IDJIError) {
              Log.e(TAG, "Failed to resume waypoint mission: ${error}")
              promise.reject("WAYPOINT_RESUME_ERROR", "Failed to resume waypoint mission: ${error}", null)
            }
          })
      } catch (e: Exception) {
        Log.e(TAG, "Failed to resume waypoint mission: ${e.message}", e)
        promise.reject("WAYPOINT_RESUME_ERROR", "Failed to resume waypoint mission: ${e.message}", e)
      }
    }
    
    AsyncFunction("getControllerInfo") { promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected", null)
          return@AsyncFunction
        }

        val controllerInfo = getControllerBasicInfo()
        promise.resolve(controllerInfo)
      } catch (e: Exception) {
        Log.e(TAG, "Failed to get controller info: ${e.message}", e)
        promise.reject("CONTROLLER_INFO_ERROR", "Failed to get controller info: ${e.message}", e)
      }
    }

    AsyncFunction("convertKMLToKMZ") { kmlPath: String, heightMode: String, promise: Promise ->
      try {
        initializeWPMZManager()
        
        Log.d(TAG, "Input file path: $kmlPath")
        
        // Handle content URI or file path
        val actualFilePath = if (kmlPath.startsWith("content://") || kmlPath.startsWith("file://")) {
          Log.d(TAG, "Detected content/file URI, copying to temp file...")
          val extension = if (kmlPath.contains(".kmz", ignoreCase = true)) ".kmz" else ".kml"
          copyContentUriToFile(kmlPath, "temp_input_${System.currentTimeMillis()}$extension")
        } else {
          Log.d(TAG, "Using direct file path: $kmlPath")
          kmlPath
        }
        
        Log.d(TAG, "Actual file path: $actualFilePath")
        
        if (actualFilePath == null) {
          promise.reject("FILE_COPY_FAILED", "Failed to copy file from URI: $kmlPath", null)
          return@AsyncFunction
        }
        
        if (!File(actualFilePath).exists()) {
          promise.reject("FILE_NOT_FOUND", "File does not exist after copy: $actualFilePath (original: $kmlPath)", null)
          return@AsyncFunction
        }
        
        Log.d(TAG, "File exists, size: ${File(actualFilePath).length()} bytes")

        val outputKmzPath = "${rootDir}/converted_${System.currentTimeMillis()}.kmz"
        val heightModeEnum = when (heightMode.uppercase()) {
          "RELATIVE" -> HeightModeCommon.RELATIVE
          "WGS84" -> HeightModeCommon.WGS84  
          "EGM96" -> HeightModeCommon.EGM96
          else -> HeightModeCommon.RELATIVE
        }
        
        Log.d(TAG, "Converting KML to KMZ: $actualFilePath -> $outputKmzPath with height mode: $heightMode")
        
        // Ensure output directory exists
        File(outputKmzPath).parentFile?.mkdirs()
        
        // Validate KML file type before conversion (following Litchi's implementation)
        Log.d(TAG, "Validating KML file type: $actualFilePath")
        val kmlFileParseInfo = try {
          KMLUtil.getKMLType(actualFilePath)
        } catch (e: Exception) {
          Log.e(TAG, "Failed to parse KML file type: ${e.message}", e)
          promise.reject("KML_PARSE_ERROR", "Failed to parse KML file: ${e.message}", e)
          return@AsyncFunction
        }
        
        Log.d(TAG, "KML file type: ${kmlFileParseInfo.fileType}, mission type: ${kmlFileParseInfo.missionType}")
        
        // Check if it's a valid KML file (following Litchi's validation logic)
        if (kmlFileParseInfo.fileType == KMLFileParseInfo.KMLFileType.UNKNOWN) {
          Log.e(TAG, "Invalid KML file - unknown type")
          promise.reject("KML_VALIDATION_ERROR", "Invalid KML file - file type is unknown or unsupported", null)
          return@AsyncFunction
        }
        
        val success = try {
          Log.d(TAG, "Starting KML to KMZ conversion process...")
          Log.d(TAG, "KML file type: ${kmlFileParseInfo.fileType}")
          Log.d(TAG, "Mission type: ${kmlFileParseInfo.missionType}")
          Log.d(TAG, "Height mode: $heightMode -> $heightModeEnum")
          
          // Set up mission import parameters
          val missionImportParams = MissionImportParams()
          missionImportParams.fileType = kmlFileParseInfo.fileType
          missionImportParams.missionType = kmlFileParseInfo.missionType ?: MissionType.Waypoint
          missionImportParams.heightMode = when (heightModeEnum) {
            HeightModeCommon.RELATIVE -> MissionImportHeightMode.RELATIVE
            HeightModeCommon.WGS84 -> MissionImportHeightMode.WGS84
            HeightModeCommon.EGM96 -> MissionImportHeightMode.EGM96
            else -> MissionImportHeightMode.RELATIVE
          }
          
          Log.d(TAG, "Mission import params configured. Importing mission...")
          
          // Import the mission from KML
          val missionModel = KMLUtil.importMission(missionImportParams, actualFilePath)
          Log.d(TAG, "Mission imported successfully: ${missionModel?.javaClass?.simpleName ?: "null"}")
          
          if (missionModel == null) {
            Log.e(TAG, "Mission model is null after import")
            throw IllegalStateException("Failed to import mission from KML - mission model is null")
          }
          
          Log.d(TAG, "Transforming mission to wayline data...")
          
          // Transform to wayline mission data following DJI's approach
          val transform = MissionGreenDaoTransform()
          val transformData = transform.generateGreenDaoMissionWayline(missionModel)
          
          Log.d(TAG, "Transform completed:")
          Log.d(TAG, "  - Mission: ${transformData.mission}")
          Log.d(TAG, "  - Mission Config: ${transformData.missionConfig}")
          Log.d(TAG, "  - Templates count: ${transformData.templates.size}")
          Log.d(TAG, "  - Waylines count: ${transformData.wayline.size}")
          
          // Generate proper KMZ file following Litchi's exact implementation
          if (transformData.templates.isNotEmpty()) {
            Log.d(TAG, "Using template-based generation (Litchi approach)")
            val template = transformData.templates.first() as WPMZTemplate
            Log.d(TAG, "Template: ${template}")
            
            WPMZManagerSdk.getInstance().generateKMZFile(
              outputKmzPath,
              transformData.mission,
              transformData.missionConfig,
              template
            )
            Log.d(TAG, "Generated KMZ using template-based method")
          } else if (transformData.wayline.isNotEmpty()) {
            Log.d(TAG, "Using wayline-based generation (fallback approach)")
            val wayline = transformData.wayline.first()
            Log.d(TAG, "Wayline: ${wayline}")
            
            WPMZManagerSdk.getInstance().generateKMZFile(
              outputKmzPath,
              transformData.mission,
              transformData.missionConfig,
              wayline
            )
            Log.d(TAG, "Generated KMZ using wayline-based method")
          } else {
            Log.e(TAG, "No templates or waylines found in transform data")
            Log.e(TAG, "Transform data details:")
            Log.e(TAG, "  - Mission: ${transformData.mission}")
            Log.e(TAG, "  - Config: ${transformData.missionConfig}")
            throw IllegalStateException("No templates or waylines found in transformed mission data")
          }
          
          Log.d(TAG, "Checking generated KMZ file...")
          val kmzFile = File(outputKmzPath)
          if (kmzFile.exists()) {
            Log.d(TAG, "KMZ file generated successfully. Size: ${kmzFile.length()} bytes")
            true
          } else {
            Log.e(TAG, "KMZ file was not created at: $outputKmzPath")
            false
          }
        } catch (throwable: Throwable) {
          Log.e(TAG, "KML to KMZ conversion failed with throwable", throwable)
          Log.e(TAG, "Exception type: ${throwable.javaClass.simpleName}")
          Log.e(TAG, "Exception message: ${throwable.message}")
          throwable.printStackTrace()
          false
        }
        
        if (success && File(outputKmzPath).exists()) {
          // Validate the generated KMZ file
          val validation = WPMZManagerSdk.getInstance().checkValidation(outputKmzPath)
          
          promise.resolve(mapOf(
            "success" to true,
            "kmzPath" to outputKmzPath,
            "isValid" to (validation.value?.isEmpty() ?: true),
            "errorCode" to (validation.value?.size ?: 0),
            "validationErrors" to (validation.value?.map { it.name } ?: emptyList<String>()),
            "validationWarnings" to emptyList<String>()
          ))
        } else {
          val errorMsg = if (File(outputKmzPath).exists()) {
            "Conversion reported failure but KMZ file exists"
          } else {
            "Conversion failed and no KMZ file was created"
          }
          Log.e(TAG, "KML conversion failed: $errorMsg")
          promise.reject("KML_CONVERSION_ERROR", "Failed to convert KML to KMZ: $errorMsg", null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "KML conversion error: ${e.message}", e)
        e.printStackTrace()
        promise.reject("KML_CONVERSION_ERROR", "KML conversion failed: ${e.message}", e)
      }
    }

    AsyncFunction("validateKMZFile") { kmzPath: String, promise: Promise ->
      try {
        initializeWPMZManager()
        
        // Handle content URI or file path
        val actualFilePath = if (kmzPath.startsWith("content://")) {
          copyContentUriToFile(kmzPath, "temp_validate.kmz")
        } else {
          kmzPath
        }
        
        if (actualFilePath == null || !File(actualFilePath).exists()) {
          promise.reject("FILE_NOT_FOUND", "KMZ file not found or could not be copied: $kmzPath", null)
          return@AsyncFunction
        }

        Log.d(TAG, "Validating KMZ file: $actualFilePath")
        val validation = WPMZManagerSdk.getInstance().checkValidation(actualFilePath)
        
        promise.resolve(mapOf(
          "isValid" to (validation.value?.isEmpty() ?: true),
          "errorCode" to (validation.value?.size ?: 0),
          "errors" to (validation.value?.map { it.name } ?: emptyList<String>()),
          "warnings" to emptyList<String>(),
          "filePath" to kmzPath
        ))
      } catch (e: Exception) {
        Log.e(TAG, "KMZ validation error: ${e.message}", e)
        promise.reject("VALIDATION_ERROR", "Failed to validate KMZ: ${e.message}", e)
      }
    }

    // Debug logging functions
    AsyncFunction("enableDebugLogging") { enabled: Boolean, promise: Promise ->
      isDebugLoggingEnabled = enabled
      if (enabled) {
        debugLogQueue.clear()
        addDebugLog("DEBUG", "Debug logging enabled")
        promise.resolve(mapOf("enabled" to true, "message" to "Debug logging enabled"))
      } else {
        addDebugLog("DEBUG", "Debug logging disabled")
        promise.resolve(mapOf("enabled" to false, "message" to "Debug logging disabled"))
      }
    }
    
    AsyncFunction("getDebugLogs") { promise: Promise ->
      promise.resolve(mapOf(
        "logs" to debugLogQueue.toList(),
        "count" to debugLogQueue.size,
        "enabled" to isDebugLoggingEnabled
      ))
    }
    
    AsyncFunction("clearDebugLogs") { promise: Promise ->
      val clearedCount = debugLogQueue.size
      debugLogQueue.clear()
      addDebugLog("DEBUG", "Debug logs cleared")
      promise.resolve(mapOf("clearedCount" to clearedCount))
    }

    AsyncFunction("uploadKMZToAircraft") { kmzPath: String, promise: Promise ->
      try {
        if (!isProductConnected) {
          promise.reject("NOT_CONNECTED", "No drone connected. Please ensure drone is powered on and connected.", null)
          return@AsyncFunction
        }
        
        // Check waypoint mission state before upload
        val missionState = currentWaypointMissionState
        Log.d(TAG, "Current waypoint mission state before upload: $missionState")
        
        // Check if mission manager is busy
        if (missionState == WaypointMissionExecuteState.EXECUTING || 
            missionState == WaypointMissionExecuteState.INTERRUPTED) {
          promise.reject("MISSION_BUSY", "A waypoint mission is currently executing. Please stop it first.", null)
          return@AsyncFunction
        }

        // Handle content URI or file path
        val actualFilePath = if (kmzPath.startsWith("content://")) {
          copyContentUriToFile(kmzPath, "temp_upload.kmz")
        } else {
          kmzPath
        }

        if (actualFilePath == null || !File(actualFilePath).exists()) {
          promise.reject("FILE_NOT_FOUND", "KMZ file not found or could not be copied: $kmzPath", null)
          return@AsyncFunction
        }

        initializeWPMZManager()

        // Validate before upload
        val validation = WPMZManagerSdk.getInstance().checkValidation(actualFilePath)
        if (validation.value?.isNotEmpty() == true) {
          promise.reject("INVALID_KMZ", "KMZ validation failed: ${validation.value?.map { it.name }?.joinToString()}", null)
          return@AsyncFunction
        }

        // Additional diagnostics before upload
        addDebugLog("INFO", "Starting KMZ upload to aircraft")
        addDebugLog("DEBUG", "File path: $actualFilePath")
        addDebugLog("DEBUG", "File size: ${File(actualFilePath).length()} bytes")
        addDebugLog("DEBUG", "File exists: ${File(actualFilePath).exists()}")
        addDebugLog("DEBUG", "Is product connected: $isProductConnected")
        addDebugLog("DEBUG", "Mission state: $currentWaypointMissionState")
        addDebugLog("DEBUG", "Mission manager instance: ${WaypointMissionManager.getInstance()}")
        
        // Try to read the KMZ info to verify it's properly formatted
        try {
          val kmzInfo = WPMZManagerSdk.getInstance().getKMZInfo(actualFilePath)
          addDebugLog("DEBUG", "KMZ info retrieved successfully")
          addDebugLog("DEBUG", "Mission config: ${kmzInfo.waylineMissionConfigParseInfo}")
          addDebugLog("DEBUG", "Mission info: ${kmzInfo.waylineMissionParseInfo}")
        } catch (e: Exception) {
          addDebugLog("ERROR", "Failed to get KMZ info: ${e.message}")
        }
        
        // Check if we can read wayline IDs from the file
        try {
          val testWaylines = WaypointMissionManager.getInstance().getAvailableWaylineIDs(actualFilePath)
          addDebugLog("DEBUG", "Available waylines in file: ${testWaylines.size} - IDs: $testWaylines")
        } catch (e: Exception) {
          addDebugLog("WARN", "Could not read wayline IDs from file: ${e.message}")
        }

        WaypointMissionManager.getInstance().pushKMZFileToAircraft(
          actualFilePath,
          object : CommonCallbacks.CompletionCallbackWithProgress<Double> {
            override fun onProgressUpdate(progress: Double) {
              val percentage = (progress * 100).toInt()
              addDebugLog("DEBUG", "Upload progress: ${percentage}%")
              sendEvent("onWaypointMissionUploadProgress", mapOf(
                "progress" to progress,
                "percentage" to percentage,
                "status" to "uploading"
              ))
            }

            override fun onSuccess() {
              addDebugLog("INFO", "KMZ upload successful")
              try {
                val availableWaylines = getAvailableWaylineIDs(actualFilePath)
                promise.resolve(mapOf(
                  "success" to true,
                  "message" to "Mission uploaded successfully",
                  "availableWaylines" to availableWaylines,
                  "waylineCount" to availableWaylines.size,
                  "filePath" to actualFilePath
                ))
              } catch (e: Exception) {
                Log.w(TAG, "Failed to get wayline IDs after upload: ${e.message}")
                promise.resolve(mapOf(
                  "success" to true,
                  "message" to "Mission uploaded successfully (wayline info unavailable)",
                  "filePath" to actualFilePath
                ))
              }
            }

            override fun onFailure(error: IDJIError) {
              val errorCode = error.errorCode()
              val errorDesc = error.description() ?: "Unknown error"
              val errorMsg = error.toString()
              
              // Log comprehensive error details using debug logging system
              addDebugLog("ERROR", "=== KMZ UPLOAD FAILED ===")
              addDebugLog("ERROR", "Error Code: $errorCode")
              addDebugLog("ERROR", "Error Description: $errorDesc")
              addDebugLog("ERROR", "Error Message: $errorMsg")
              addDebugLog("ERROR", "Error Class: ${error.javaClass.simpleName}")
              addDebugLog("ERROR", "File Path: $actualFilePath")
              
              // Try to get additional context from DJI SDK
              try {
                addDebugLog("ERROR", "Connection Status: ${if (isProductConnected) "Connected" else "Disconnected"}")
                addDebugLog("ERROR", "Mission Manager State: $currentWaypointMissionState")
                addDebugLog("ERROR", "File Size: ${if (File(actualFilePath).exists()) File(actualFilePath).length() else "File not found"} bytes")
                addDebugLog("ERROR", "Product ID: $currentProductId")
                
                // Try to get product type information
                try {
                  val productKey = ProductKey.KeyProductType.create()
                  val productTypeValue = productKey.get()
                  addDebugLog("ERROR", "Product Type: $productTypeValue")
                } catch (productError: Exception) {
                  addDebugLog("ERROR", "Could not get product type: ${productError.message}")
                }
                
              } catch (contextError: Exception) {
                addDebugLog("ERROR", "Error getting context: ${contextError.message}")
              }
              addDebugLog("ERROR", "========================")
              
              // Provide user-friendly error messages with technical details for debugging
              val detailedError = when {
                errorDesc.contains("not connected", ignoreCase = true) -> "Aircraft not connected or out of range"
                errorDesc.contains("busy", ignoreCase = true) -> "Aircraft is busy, please wait and try again"
                errorDesc.contains("format", ignoreCase = true) -> "Invalid KMZ file format"
                errorDesc.contains("storage", ignoreCase = true) -> "Insufficient storage on aircraft"
                errorDesc.contains("request handle not found", ignoreCase = true) -> "Internal DJI SDK error - try disconnecting and reconnecting the aircraft"
                errorCode.contains("TIMEOUT") -> "Upload timeout - check connection to aircraft"
                errorCode.contains("DISCONNECTED") -> "Lost connection to aircraft during upload"
                else -> "Upload failed: $errorDesc"
              }
              
              // Create error data with technical details for debugging
              val errorData = mapOf(
                "userMessage" to detailedError,
                "technicalDetails" to mapOf(
                  "errorCode" to errorCode,
                  "errorDescription" to errorDesc,
                  "errorMessage" to errorMsg,
                  "filePath" to actualFilePath,
                  "timestamp" to System.currentTimeMillis()
                )
              )
              
              promise.reject("UPLOAD_FAILED", detailedError, null)
            }
          }
        )
      } catch (e: Exception) {
        Log.e(TAG, "Upload error: ${e.message}", e)
        promise.reject("UPLOAD_ERROR", "Upload error: ${e.message}", e)
      }
    }

    AsyncFunction("getAvailableWaylines") { kmzPath: String, promise: Promise ->
      try {
        // Handle content URI or file path
        val actualFilePath = if (kmzPath.startsWith("content://")) {
          copyContentUriToFile(kmzPath, "temp_waylines.kmz")
        } else {
          kmzPath
        }

        if (actualFilePath == null || !File(actualFilePath).exists()) {
          promise.reject("FILE_NOT_FOUND", "KMZ file not found or could not be copied: $kmzPath", null)
          return@AsyncFunction
        }

        val waylineIds = getAvailableWaylineIDs(actualFilePath)
        promise.resolve(mapOf(
          "success" to true,
          "waylineIds" to waylineIds,
          "count" to waylineIds.size,
          "filePath" to actualFilePath
        ))
      } catch (e: Exception) {
        Log.e(TAG, "Failed to get waylines: ${e.message}", e)
        promise.reject("GET_WAYLINES_ERROR", "Failed to get waylines: ${e.message}", e)
      }
    }

    AsyncFunction("generateTestWaypointMission") { latitude: Double?, longitude: Double?, promise: Promise ->
      try {
        initializeWaypointMission()
        
        // Use current GPS location if provided, otherwise use default coordinates
        val centerLat = latitude ?: -7.425990014912149 // Your coordinates as fallback
        val centerLon = longitude ?: 112.69747710061603
        
        val kmzPath = generateWaypointMissionFile(centerLat, centerLon)
        
        if (kmzPath.isNotEmpty()) {
          promise.resolve(mapOf(
            "success" to true,
            "message" to "Test waypoint mission generated successfully",
            "filePath" to kmzPath,
            "waypointCount" to 4 // Square pattern with 4 waypoints
          ))
        } else {
          promise.resolve(mapOf(
            "success" to false,
            "error" to "Failed to generate waypoint mission file"
          ))
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to generate waypoint mission: ${e.message}", e)
        promise.resolve(mapOf(
          "success" to false,
          "error" to "Failed to generate waypoint mission: ${e.message}"
        ))
      }
    }

    // KML Mission Methods
    AsyncFunction("importKMLMission") { kmlFilePath: String, options: Map<String, Any>?, promise: Promise ->
      try {
        val config = parseKMLMissionConfig(options ?: emptyMap())
        
        val callback = object : KMLMissionManager.KMLMissionCallback {
          override fun onMissionPrepared(stats: expo.modules.djisdk.kml.MissionStats) {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionPrepared",
              "data" to mapOf(
                "totalDistance" to stats.totalDistance,
                "minAltitude" to stats.minAltitude,
                "maxAltitude" to stats.maxAltitude,
                "altitudeRange" to stats.altitudeRange
              )
            ))
          }

          override fun onMissionStarted(type: KMLMissionManager.MissionType) {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionStarted",
              "missionType" to type.name.lowercase()
            ))
          }

          override fun onMissionProgress(progress: KMLMissionManager.MissionProgress) {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionProgress",
              "data" to mapOf(
                "currentWaypoint" to progress.currentWaypoint,
                "totalWaypoints" to progress.totalWaypoints,
                "progress" to progress.progress,
                "distanceToTarget" to progress.distanceToTarget
              )
            ))
          }

          override fun onMissionCompleted() {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionCompleted"
            ))
          }

          override fun onMissionFailed(error: String) {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionFailed",
              "error" to error
            ))
          }

          override fun onMissionPaused() {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionPaused"
            ))
          }

          override fun onMissionResumed() {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionResumed"
            ))
          }
        }

        kmlMissionManager.importAndExecuteKML(kmlFilePath, config, callback, promise)
        
      } catch (e: Exception) {
        Log.e(TAG, "Failed to import KML mission: ${e.message}", e)
        promise.reject("IMPORT_ERROR", "Failed to import KML mission: ${e.message}", null)
      }
    }

    AsyncFunction("previewKMLMission") { kmlFilePath: String, promise: Promise ->
      kmlMissionManager.previewMission(kmlFilePath, promise)
    }

    AsyncFunction("previewKMLMissionFromContent") { kmlContent: String, promise: Promise ->
      kmlMissionManager.previewMissionFromContent(kmlContent, promise)
    }

    AsyncFunction("importKMLMissionFromContent") { kmlContent: String, options: Map<String, Any>?, promise: Promise ->
      try {
        val config = parseKMLMissionConfig(options ?: emptyMap())
        
        val callback = object : KMLMissionManager.KMLMissionCallback {
          override fun onMissionPrepared(stats: expo.modules.djisdk.kml.MissionStats) {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionPrepared",
              "data" to mapOf(
                "totalDistance" to stats.totalDistance,
                "minAltitude" to stats.minAltitude,
                "maxAltitude" to stats.maxAltitude,
                "altitudeRange" to stats.altitudeRange
              )
            ))
          }

          override fun onMissionStarted(type: KMLMissionManager.MissionType) {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionStarted",
              "missionType" to type.name.lowercase()
            ))
          }

          override fun onMissionProgress(progress: KMLMissionManager.MissionProgress) {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionProgress",
              "data" to mapOf(
                "currentWaypoint" to progress.currentWaypoint,
                "totalWaypoints" to progress.totalWaypoints,
                "progress" to progress.progress,
                "distanceToTarget" to progress.distanceToTarget
              )
            ))
          }

          override fun onMissionCompleted() {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionCompleted"
            ))
          }

          override fun onMissionFailed(error: String) {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionFailed",
              "error" to error
            ))
          }

          override fun onMissionPaused() {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionPaused"
            ))
          }

          override fun onMissionResumed() {
            sendEvent("onKMLMissionEvent", mapOf(
              "type" to "missionResumed"
            ))
          }
        }

        kmlMissionManager.importAndExecuteKMLFromContent(kmlContent, config, callback, promise)
        
      } catch (e: Exception) {
        Log.e(TAG, "Failed to import KML mission from content: ${e.message}", e)
        promise.reject("IMPORT_ERROR", "Failed to import KML mission from content: ${e.message}", null)
      }
    }

    AsyncFunction("pauseKMLMission") { promise: Promise ->
      kmlMissionManager.pauseMission(promise)
    }

    AsyncFunction("resumeKMLMission") { promise: Promise ->
      kmlMissionManager.resumeMission(promise)
    }

    AsyncFunction("stopKMLMission") { promise: Promise ->
      kmlMissionManager.stopMission(promise)
    }

    AsyncFunction("getKMLMissionStatus") { promise: Promise ->
      try {
        val status = kmlMissionManager.getMissionStatus()
        promise.resolve(status)
      } catch (e: Exception) {
        Log.e(TAG, "Failed to get KML mission status: ${e.message}", e)
        promise.reject("STATUS_ERROR", "Failed to get mission status: ${e.message}", null)
      }
    }

    AsyncFunction("convertKMLContentToKMZ") { kmlContent: String, promise: Promise ->
      kmlMissionManager.convertKMLContentToKMZ(kmlContent, promise)
    }
  }

  private fun setupWaypointMissionStateListener() {
    try {
      WaypointMissionManager.getInstance().addWaypointMissionExecuteStateListener { state ->
        currentWaypointMissionState = state
        Log.d(TAG, "Waypoint mission state changed: ${state.name}")
        
        // You could send an event to React Native here if needed
        // sendEvent("onWaypointMissionStateChange", mapOf("state" to state.name))
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to setup waypoint mission state listener: ${e.message}", e)
    }
  }
  
  private fun initializeWaypointMission() {
    try {
      if (waypointDirectoryInitialized) return
      
      // Initialize WPMZ Manager
      WPMZManager.getInstance().init(ContextUtil.getContext())
      
      // Create waypoint directories
      val dir = File(rootDir)
      if (!dir.exists()) {
        dir.mkdirs()
        Log.d(TAG, "Created waypoint directory: $rootDir")
      }
      
      val cacheDir = DiskUtil.getExternalCacheDirPath(ContextUtil.getContext(), WAYPOINT_SAMPLE_FILE_CACHE_DIR)
      val cacheDirFile = File(cacheDir)
      if (!cacheDirFile.exists()) {
        cacheDirFile.mkdirs()
        Log.d(TAG, "Created waypoint cache directory: $cacheDir")
      }
      
      waypointDirectoryInitialized = true
      Log.i(TAG, "Waypoint mission system initialized successfully")
      
    } catch (e: Exception) {
      Log.e(TAG, "Failed to initialize waypoint mission system: ${e.message}", e)
    }
  }
  
  private fun processWaypointFile(inputFilePath: String): String {
    try {
      val inputFile = File(inputFilePath)
      val fileName = inputFile.name
      
      when {
        fileName.endsWith(".kmz", ignoreCase = true) -> {
          // KMZ file - copy to waypoint directory
          val destPath = rootDir + fileName
          val destFile = File(destPath)
          
          if (!destFile.exists()) {
            inputFile.copyTo(destFile, overwrite = true)
            Log.d(TAG, "Copied KMZ file to: $destPath")
          }
          return destPath
        }
        
        fileName.endsWith(".kml", ignoreCase = true) -> {
          // KML file - convert to KMZ using WPMZ Manager
          val baseFileName = fileName.substringBeforeLast(".")
          val kmzFileName = "$baseFileName.kmz"
          val destPath = rootDir + kmzFileName
          
          // Copy KML to waypoint directory first
          val kmlDestPath = rootDir + fileName
          val kmlDestFile = File(kmlDestPath)
          if (!kmlDestFile.exists()) {
            inputFile.copyTo(kmlDestFile, overwrite = true)
          }
          
          // Convert KML to KMZ using WPMZManager
          val success = WPMZManager.getInstance().transKMLtoKMZ(
            kmlDestPath,
            "", // Use default output path
            HeightMode.RELATIVE // Relative to takeoff point
          )
          
          if (success) {
            // WPMZManager creates KMZ in a default location, find and copy it
            val defaultKmzPath = Environment.getExternalStorageDirectory().toString() + 
              "/DJI/" + context.packageName + "/KMZ/OutPath/" + baseFileName + ".kmz"
            val defaultKmzFile = File(defaultKmzPath)
            
            if (defaultKmzFile.exists()) {
              defaultKmzFile.copyTo(File(destPath), overwrite = true)
              Log.d(TAG, "Converted KML to KMZ: $destPath")
              return destPath
            }
          }
          
          Log.w(TAG, "Failed to convert KML to KMZ, using original KML")
          return kmlDestPath
        }
        
        else -> {
          Log.e(TAG, "Unsupported file format: $fileName")
          return ""
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to process waypoint file: ${e.message}", e)
      return ""
    }
  }
  
  private fun setupVirtualStickListener() {
    try {
      VirtualStickManager.getInstance().setVirtualStickStateListener(object : VirtualStickStateListener {
        override fun onVirtualStickStateUpdate(stickState: VirtualStickState) {
          currentVirtualStickState = stickState
          sendEvent("onVirtualStickStateChange", mapOf(
            "type" to "stateUpdate",
            "state" to mapOf(
              "isVirtualStickEnabled" to stickState.isVirtualStickEnable,
              "currentFlightControlAuthorityOwner" to stickState.currentFlightControlAuthorityOwner.name,
              "isVirtualStickAdvancedModeEnabled" to stickState.isVirtualStickAdvancedModeEnabled
            )
          ))
        }

        override fun onChangeReasonUpdate(reason: FlightControlAuthorityChangeReason) {
          sendEvent("onVirtualStickStateChange", mapOf(
            "type" to "authorityChange",
            "reason" to reason.name
          ))
        }
      })
    } catch (e: Exception) {
      Log.e(TAG, "Failed to setup virtual stick listener: ${e.message}", e)
    }
  }
  
  // Waypoint generation is temporarily disabled due to complex DJI SDK dependencies
  // Users should use existing KML/KMZ files via the SELECT KMZ button

  private fun generateWaypointMissionFile(centerLat: Double, centerLon: Double): String {
    try {
      val timestamp = System.currentTimeMillis()
      val kmzFileName = "generated_waypoint_mission_${timestamp}.kmz"
      val kmzPath = rootDir + kmzFileName
      
      // Create wayline mission
      val waylineMission = createWaylineMission()
      
      // Create mission config
      val missionConfig = createMissionConfig()
      
      // Create waypoints
      val waypoints = createSquareWaypoints(centerLat, centerLon)
      
      // Create template
      val template = createTemplate(waypoints)
      
      // Generate KMZ file
      WPMZManager.getInstance().generateKMZFile(
        kmzPath,
        waylineMission,
        missionConfig,
        template
      )
      
      Log.i(TAG, "Generated waypoint mission file: $kmzPath")
      return kmzPath
      
    } catch (e: Exception) {
      Log.e(TAG, "Failed to generate waypoint mission file: ${e.message}", e)
      return ""
    }
  }
  
  private fun createWaylineMission(): WaylineMission {
    val waylineMission = WaylineMission()
    waylineMission.createTime = System.currentTimeMillis().toDouble()
    waylineMission.updateTime = System.currentTimeMillis().toDouble()
    return waylineMission
  }
  
  private fun createMissionConfig(): WaylineMissionConfig {
    val config = WaylineMissionConfig()
    config.flyToWaylineMode = WaylineFlyToWaylineMode.SAFELY
    config.finishAction = WaylineFinishedAction.GO_HOME
    
    val droneInfo = WaylineDroneInfo()
    config.droneInfo = droneInfo
    config.securityTakeOffHeight = 20.0
    config.isSecurityTakeOffHeightSet = true
    config.exitOnRCLostBehavior = WaylineExitOnRCLostBehavior.EXCUTE_RC_LOST_ACTION
    config.exitOnRCLostType = WaylineExitOnRCLostAction.GO_BACK
    config.globalTransitionalSpeed = 10.0
    
    val payloadInfos = ArrayList<WaylinePayloadInfo>()
    config.payloadInfo = payloadInfos
    return config
  }
  
  private fun createSquareWaypoints(centerLat: Double, centerLon: Double): List<WaylineWaypoint> {
    val waypoints = mutableListOf<WaylineWaypoint>()
    
    // Convert 50 meters to degrees (rough approximation)
    val latOffset = 50.0 / 111320.0 / 2.0 // Half the square size
    val lonOffset = 50.0 / (111320.0 * Math.cos(Math.toRadians(centerLat))) / 2.0
    
    // Create 4 waypoints in square pattern: NE, SE, SW, NW
    val coordinates = listOf(
      Triple(centerLat + latOffset, centerLon + lonOffset, 20.0), // Northeast
      Triple(centerLat - latOffset, centerLon + lonOffset, 20.0), // Southeast  
      Triple(centerLat - latOffset, centerLon - lonOffset, 20.0), // Southwest
      Triple(centerLat + latOffset, centerLon - lonOffset, 20.0)  // Northwest
    )
    
    coordinates.forEachIndexed { index, (lat, lon, height) ->
      val waypoint = WaylineWaypoint()
      waypoint.waypointIndex = index + 1
      
      val location = WaylineLocationCoordinate2D(lat, lon)
      waypoint.location = location
      waypoint.height = height
      waypoint.ellipsoidHeight = height
      waypoint.speed = 5.0
      waypoint.useGlobalTurnParam = true
      waypoint.gimbalPitchAngle = -30.0
      
      // Yaw parameters
      val yawParam = WaylineWaypointYawParam()
      yawParam.enableYawAngle = false
      yawParam.yawAngle = 0.0
      yawParam.yawMode = WaylineWaypointYawMode.FOLLOW_WAYLINE
      yawParam.yawPathMode = WaylineWaypointYawPathMode.FOLLOW_BAD_ARC
      waypoint.yawParam = yawParam
      waypoint.useGlobalYawParam = false
      waypoint.isWaylineWaypointYawParamSet = true
      
      // Gimbal heading parameters
      val gimbalYawParam = WaylineWaypointGimbalHeadingParam()
      gimbalYawParam.headingMode = WaylineWaypointGimbalHeadingMode.FOLLOW_WAYLINE
      gimbalYawParam.pitchAngle = -30.0
      waypoint.gimbalHeadingParam = gimbalYawParam
      waypoint.isWaylineWaypointGimbalHeadingParamSet = true
      
      waypoints.add(waypoint)
    }
    
    return waypoints
  }
  
  private fun createTemplate(waypoints: List<WaylineWaypoint>): WPMZTemplate {
    val template = WPMZTemplate()
    
    val waypointInfo = WaylineTemplateWaypointInfo()
    waypointInfo.waypoints = waypoints
    template.waypointInfo = waypointInfo
    
    val coordinateParam = WaylineCoordinateParam()
    coordinateParam.coordinateMode = WaylineCoordinateMode.WGS84
    coordinateParam.altitudeMode = WaylineAltitudeMode.RELATIVE_TO_START_POINT
    template.coordinateParam = coordinateParam
    
    template.useGlobalTransitionalSpeed = true
    template.autoFlightSpeed = 5.0
    template.payloadParam = ArrayList<WaylinePayloadParam>()
    
    return template
  }

  private fun getDroneBasicInfo() {
    try {
      val droneInfo = mapOf(
        "sdkVersion" to SDKManager.getInstance().sdkVersion,
        "isRegistered" to SDKManager.getInstance().isRegistered
      )

      sendEvent("onDroneInfoUpdate", mapOf(
        "type" to "basicInfo",
        "data" to droneInfo
      ))

    } catch (e: Exception) {
      sendEvent("onDroneInfoUpdate", mapOf(
        "type" to "error",
        "error" to "Failed to get drone info: ${e.message}"
      ))
    }
  }

  private fun setupCameraStreamListener() {
    try {
      // Set up available camera updated listener
      availableCameraListener = object : ICameraStreamManager.AvailableCameraUpdatedListener {
        override fun onAvailableCameraUpdated(list: MutableList<ComponentIndexType>) {
          val availableCameras = list.map { componentIndex ->
            mapOf(
              "value" to componentIndex.ordinal,
              "name" to getComponentIndexDisplayName(componentIndex)
            )
          }
          
          sendEvent("onAvailableCameraUpdated", mapOf(
            "availableCameras" to availableCameras
          ))
        }

        override fun onCameraStreamEnableUpdate(cameraStreamEnableMap: MutableMap<ComponentIndexType, Boolean>) {
          // Handle camera stream enable/disable updates
          for ((componentIndex, isEnabled) in cameraStreamEnableMap) {
            sendEvent("onCameraStreamStatusChange", mapOf(
              "isAvailable" to true,
              "isEnabled" to isEnabled,
              "streamInfo" to getCameraStreamInfoMap(componentIndex)
            ))
          }
        }
      }
      
      cameraStreamManager.addAvailableCameraUpdatedListener(availableCameraListener!!)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to setup camera stream listener: ${e.message}", e)
    }
  }

  private fun getCameraStreamInfoMap(componentIndex: ComponentIndexType): Map<String, Any>? {
    return try {
      val streamInfo = cameraStreamManager.getAircraftStreamFrameInfo(componentIndex)
      if (streamInfo != null) {
        mapOf(
          "width" to streamInfo.width,
          "height" to streamInfo.height,
          "frameRate" to streamInfo.frameRate
        )
      } else {
        null
      }
    } catch (e: Exception) {
      null
    }
  }

  private fun getComponentIndexDisplayName(componentIndex: ComponentIndexType): String {
    return when (componentIndex) {
      ComponentIndexType.LEFT_OR_MAIN -> "Main Camera"
      ComponentIndexType.RIGHT -> "Right Camera"
      ComponentIndexType.FPV -> "FPV Camera"
      else -> "Camera ${componentIndex.ordinal}"
    }
  }

  private fun getCompassCalibrationDescription(status: String): String {
    return when (status) {
      "NONE" -> "No calibration in progress"
      "HORIZONTAL" -> "Rotate aircraft horizontally"
      "VERTICAL" -> "Rotate aircraft vertically"
      "SUCCEEDED" -> "Calibration completed successfully"
      "FAILED" -> "Calibration failed, please try again"
      else -> "Unknown calibration status"
    }
  }

  private fun getControllerBasicInfo(): Map<String, Any?> {
    return try {
      val firmwareVersionKey = FlightControllerKey.KeyFirmwareVersion.create()
      val firmwareVersion = firmwareVersionKey.get()

      mapOf(
        "firmwareVersion" to firmwareVersion,
        "isConnected" to isProductConnected,
        "connectionStatus" to if (isProductConnected) "connected" else "disconnected"
      )
    } catch (e: Exception) {
      Log.w(TAG, "Failed to get controller firmware version: ${e.message}")
      mapOf(
        "firmwareVersion" to null,
        "isConnected" to isProductConnected,
        "connectionStatus" to if (isProductConnected) "connected" else "disconnected",
        "error" to "Failed to retrieve firmware version: ${e.message}"
      )
    }
  }

  private fun initializeWPMZManager() {
    if (wpmzManagerInitialized) return
    
    try {
      Log.d(TAG, "Initializing WPMZ Manager")
      
      // Initialize KMLUtil context first (required before any KMLUtil operations)
      try {
        KMLUtil.setContext(context)
        Log.d(TAG, "KMLUtil context set successfully")
      } catch (e: Exception) {
        Log.e(TAG, "Failed to set KMLUtil context: ${e.message}", e)
      }
      
      // Initialize WPMZManager similar to Litchi implementation
      try {
        WPMZManagerSdk.getInstance().init(context)
        wpmzManagerInitialized = true
        Log.d(TAG, "WPMZ Manager initialized successfully")
      } catch (ioException: IOException) {
        Log.e(TAG, "WPMZ Manager initialization failed with IOException: ${ioException.message}", ioException)
        // Try to continue without full initialization - some operations may still work
        wpmzManagerInitialized = true
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to initialize WPMZ Manager: ${e.message}", e)
      // Continue anyway, as some functionality might still work
      wpmzManagerInitialized = true
    }
  }

  private fun getAvailableWaylineIDs(kmzPath: String): List<Int> {
    return try {
      WaypointMissionManager.getInstance().getAvailableWaylineIDs(kmzPath)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to get wayline IDs: ${e.message}")
      emptyList()
    }
  }

  private fun copyContentUriToFile(contentUri: String, fileName: String): String? {
    return try {
      Log.d(TAG, "Copying URI: $contentUri to file: $fileName")
      
      // Handle both content:// and file:// URIs
      val uri = Uri.parse(contentUri)
      Log.d(TAG, "Parsed URI scheme: ${uri.scheme}")
      
      val inputStream: InputStream? = when {
        contentUri.startsWith("content://") -> {
          Log.d(TAG, "Opening content URI with ContentResolver")
          context.contentResolver.openInputStream(uri)
        }
        contentUri.startsWith("file://") -> {
          Log.d(TAG, "Opening file URI directly")
          val filePath = uri.path
          if (filePath != null && File(filePath).exists()) {
            File(filePath).inputStream()
          } else {
            Log.e(TAG, "File URI path does not exist: $filePath")
            null
          }
        }
        else -> {
          Log.d(TAG, "Trying direct file path: $contentUri")
          if (File(contentUri).exists()) {
            File(contentUri).inputStream()
          } else {
            null
          }
        }
      }
      
      if (inputStream == null) {
        Log.e(TAG, "Failed to open input stream for URI: $contentUri")
        return null
      }

      // Ensure waypoint directory exists
      initializeWaypointMission()
      val tempFile = File(rootDir, fileName)
      
      Log.d(TAG, "Creating temp file at: ${tempFile.absolutePath}")
      
      // Ensure parent directory exists
      tempFile.parentFile?.mkdirs()
      
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

      Log.d(TAG, "Successfully copied $totalBytes bytes to: ${tempFile.absolutePath}")
      Log.d(TAG, "File exists after copy: ${tempFile.exists()}, size: ${tempFile.length()}")
      
      tempFile.absolutePath
    } catch (e: Exception) {
      Log.e(TAG, "Failed to copy content URI to file: ${e.message}", e)
      e.printStackTrace()
      null
    }
  }

  private fun parseKMLMissionConfig(options: Map<String, Any>): expo.modules.djisdk.kml.MissionConfig {
    return expo.modules.djisdk.kml.MissionConfig(
      speed = (options["speed"] as? Number)?.toFloat() ?: 5.0f,
      maxSpeed = (options["maxSpeed"] as? Number)?.toFloat() ?: 10.0f,
      enableTakePhoto = options["enableTakePhoto"] as? Boolean ?: false,
      enableStartRecording = options["enableStartRecording"] as? Boolean ?: false
    )
  }
  
  // Debug logging helper functions
  private fun addDebugLog(level: String, message: String) {
    if (isDebugLoggingEnabled) {
      val timestamp = System.currentTimeMillis()
      val logEntry = "$timestamp|$level|$message"
      
      synchronized(debugLogQueue) {
        debugLogQueue.add(logEntry)
        
        // Keep only the latest entries
        if (debugLogQueue.size > maxLogEntries) {
          debugLogQueue.removeAt(0)
        }
      }
      
      // Send real-time log to React Native
      sendEvent("onDebugLog", mapOf(
        "timestamp" to timestamp,
        "level" to level,
        "message" to message,
        "logEntry" to logEntry
      ))
    }
    
    // Always write to Android log
    when (level) {
      "ERROR" -> Log.e(TAG, message)
      "WARN" -> Log.w(TAG, message)
      "INFO" -> Log.i(TAG, message)
      "DEBUG" -> Log.d(TAG, message)
      else -> Log.d(TAG, message)
    }
  }
}
