package expo.modules.djisdk

import android.content.Context
import android.util.Log
import dji.v5.common.error.IDJIError
import dji.v5.common.register.DJISDKInitEvent
import dji.v5.manager.SDKManager
import dji.v5.manager.interfaces.SDKManagerCallback
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoDjiSdkModule : Module() {
  companion object {
    private const val TAG = "ExpoDjiSdk"
  }
  
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("ExpoDjiSdk")

    Events("onSDKRegistrationResult", "onDroneConnectionChange", "onDroneInfoUpdate", "onSDKInitProgress", "onDatabaseDownloadProgress")

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
            sendEvent("onDroneConnectionChange", mapOf(
              "connected" to false,
              "productId" to productId
            ))
          }

          override fun onProductConnect(productId: Int) {
            sendEvent("onDroneConnectionChange", mapOf(
              "connected" to true,
              "productId" to productId
            ))
            
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
        val isConnected = SDKManager.getInstance().isRegistered
        promise.resolve(isConnected)
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
