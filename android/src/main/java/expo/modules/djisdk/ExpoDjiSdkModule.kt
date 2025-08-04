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
import dji.v5.manager.aircraft.simulator.SimulatorManager
import dji.v5.manager.aircraft.simulator.SimulatorStatusListener
import dji.v5.manager.aircraft.simulator.InitializationSettings
import dji.sdk.keyvalue.value.common.LocationCoordinate2D
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.v5.et.action
import dji.sdk.keyvalue.key.ProductKey
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.v5.et.create
import dji.v5.et.get
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
  private var simulatorStatusListener: SimulatorStatusListener? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoDjiSdk")

    Events("onSDKRegistrationResult", "onDroneConnectionChange", "onDroneInfoUpdate", "onSDKInitProgress", "onDatabaseDownloadProgress", "onVirtualStickStateChange", "onSimulatorStateChange")

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
            setupSimulatorListener()
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

    AsyncFunction("enableSimulator") { latitude: Double, longitude: Double, satelliteCount: Int, promise: Promise ->
      try {
        val coordinate = LocationCoordinate2D(latitude, longitude)
        val initSettings = InitializationSettings.createInstance(coordinate, satelliteCount)
        
        SimulatorManager.getInstance().enableSimulator(initSettings, object : CommonCallbacks.CompletionCallback {
          override fun onSuccess() {
            promise.resolve(mapOf("success" to true))
          }
          
          override fun onFailure(error: IDJIError) {
            promise.reject("SIMULATOR_ERROR", "Failed to enable simulator: ${error.description()}", null)
          }
        })
      } catch (e: Exception) {
        promise.reject("SIMULATOR_ERROR", "Failed to enable simulator: ${e.message}", e)
      }
    }

    AsyncFunction("disableSimulator") { promise: Promise ->
      try {
        SimulatorManager.getInstance().disableSimulator(object : CommonCallbacks.CompletionCallback {
          override fun onSuccess() {
            promise.resolve(mapOf("success" to true))
          }
          
          override fun onFailure(error: IDJIError) {
            promise.reject("SIMULATOR_ERROR", "Failed to disable simulator: ${error.description()}", null)
          }
        })
      } catch (e: Exception) {
        promise.reject("SIMULATOR_ERROR", "Failed to disable simulator: ${e.message}", e)
      }
    }

    AsyncFunction("isSimulatorEnabled") { promise: Promise ->
      try {
        val isEnabled = SimulatorManager.getInstance().isSimulatorEnabled
        promise.resolve(mapOf("enabled" to isEnabled))
      } catch (e: Exception) {
        promise.reject("SIMULATOR_STATE_ERROR", "Failed to get simulator state: ${e.message}", e)
      }
    }

    AsyncFunction("setVirtualStickControlData") { leftHorizontal: Int, leftVertical: Int, rightHorizontal: Int, rightVertical: Int, promise: Promise ->
      try {
        val virtualStickManager = VirtualStickManager.getInstance()
        virtualStickManager.leftStick.horizontalPosition = leftHorizontal
        virtualStickManager.leftStick.verticalPosition = leftVertical
        virtualStickManager.rightStick.horizontalPosition = rightHorizontal
        virtualStickManager.rightStick.verticalPosition = rightVertical
        promise.resolve(mapOf("success" to true))
      } catch (e: Exception) {
        promise.reject("VIRTUAL_STICK_CONTROL_ERROR", "Failed to set virtual stick control data: ${e.message}", e)
      }
    }

    AsyncFunction("setVirtualStickSpeedLevel") { speedLevel: Double, promise: Promise ->
      try {
        VirtualStickManager.getInstance().speedLevel = speedLevel
        promise.resolve(mapOf("success" to true))
      } catch (e: Exception) {
        promise.reject("VIRTUAL_STICK_SPEED_ERROR", "Failed to set virtual stick speed level: ${e.message}", e)
      }
    }

    AsyncFunction("takeoff") { promise: Promise ->
      try {
        FlightControllerKey.KeyStartTakeoff.create().action({
          promise.resolve(mapOf("success" to true))
        }, { error: IDJIError ->
          promise.reject("TAKEOFF_ERROR", "Failed to takeoff: ${error.description()}", null)
        })
      } catch (e: Exception) {
        promise.reject("TAKEOFF_ERROR", "Failed to takeoff: ${e.message}", e)
      }
    }

    AsyncFunction("land") { promise: Promise ->
      try {
        FlightControllerKey.KeyStartAutoLanding.create().action({
          promise.resolve(mapOf("success" to true))
        }, { error: IDJIError ->
          promise.reject("LANDING_ERROR", "Failed to land: ${error.description()}", null)
        })
      } catch (e: Exception) {
        promise.reject("LANDING_ERROR", "Failed to land: ${e.message}", e)
      }
    }

    AsyncFunction("cancelLanding") { promise: Promise ->
      try {
        FlightControllerKey.KeyStopAutoLanding.create().action({
          promise.resolve(mapOf("success" to true))
        }, { error: IDJIError ->
          promise.reject("CANCEL_LANDING_ERROR", "Failed to cancel landing: ${error.description()}", null)
        })
      } catch (e: Exception) {
        promise.reject("CANCEL_LANDING_ERROR", "Failed to cancel landing: ${e.message}", e)
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

  private fun setupSimulatorListener() {
    try {
      val listener = SimulatorStatusListener { state ->
        sendEvent("onSimulatorStateChange", mapOf(
          "type" to "stateUpdate",
          "state" to mapOf(
            "isEnabled" to SimulatorManager.getInstance().isSimulatorEnabled,
            "areMotorsOn" to state.areMotorsOn(),
            "isFlying" to state.isFlying,
            "roll" to state.roll,
            "pitch" to state.pitch,
            "yaw" to state.yaw,
            "positionX" to state.positionX,
            "positionY" to state.positionY,
            "positionZ" to state.positionZ,
            "latitude" to state.location.latitude,
            "longitude" to state.location.longitude,
            "velocityX" to 0.0, // Not available in DJI V5 simulator
            "velocityY" to 0.0, // Not available in DJI V5 simulator
            "velocityZ" to 0.0, // Not available in DJI V5 simulator
            "windSpeedX" to 0.0, // Not available in DJI V5 simulator
            "windSpeedY" to 0.0, // Not available in DJI V5 simulator
            "windSpeedZ" to 0.0, // Not available in DJI V5 simulator
            "timestamp" to System.currentTimeMillis()
          )
        ))
      }
      simulatorStatusListener = listener
      SimulatorManager.getInstance().addSimulatorStateListener(listener)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to setup simulator listener: ${e.message}", e)
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
}
