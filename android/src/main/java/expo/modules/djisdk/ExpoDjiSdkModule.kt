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
import android.view.Surface
import dji.sdk.keyvalue.key.ProductKey
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.v5.et.create
import dji.v5.et.get
import dji.v5.et.action
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoDjiSdkModule : Module() {
  companion object {
    private const val TAG = "ExpoDjiSdk"
  }
  
  private val context: Context
    get() = requireNotNull(appContext.reactContext)
  
  private var isProductConnected = false
  private var currentVirtualStickState: VirtualStickState? = null
  private var currentProductId: Int = -1
  
  // Camera stream management
  private val cameraStreamManager: ICameraStreamManager 
    get() = MediaDataCenter.getInstance().cameraStreamManager
  private var availableCameraListener: ICameraStreamManager.AvailableCameraUpdatedListener? = null
  private var currentCameraSurfaces = mutableMapOf<Int, Surface>()

  override fun definition() = ModuleDefinition {
    Name("ExpoDjiSdk")

    Events("onSDKRegistrationResult", "onDroneConnectionChange", "onDroneInfoUpdate", "onSDKInitProgress", "onDatabaseDownloadProgress", "onVirtualStickStateChange", "onAvailableCameraUpdated", "onCameraStreamStatusChange", "onTakeoffResult", "onLandingResult", "onFlightStatusChange")
    
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
}
