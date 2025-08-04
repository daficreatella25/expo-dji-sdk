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

  override fun definition() = ModuleDefinition {
    Name("ExpoDjiSdk")

    Events("onSDKRegistrationResult", "onDroneConnectionChange", "onDroneInfoUpdate", "onSDKInitProgress", "onDatabaseDownloadProgress", "onVirtualStickStateChange")

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
            sendEvent("onDroneConnectionChange", mapOf(
              "connected" to false,
              "productId" to productId
            ))
          }

          override fun onProductConnect(productId: Int) {
            isProductConnected = true
            sendEvent("onDroneConnectionChange", mapOf(
              "connected" to true,
              "productId" to productId
            ))
            
            setupVirtualStickListener()
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
}
