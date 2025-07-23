package expo.modules.djisdk

import android.content.Context
import dji.v5.common.error.IDJIError
import dji.v5.common.register.DJISDKInitEvent
import dji.v5.manager.SDKManager
import dji.v5.manager.interfaces.SDKManagerCallback
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoDjiSdkModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("ExpoDjiSdk")

    Events("onSDKRegistrationResult", "onDroneConnectionChange", "onDroneInfoUpdate")

    AsyncFunction("initializeSDK") { appKey: String, promise: Promise ->
      try {
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
            if (event == DJISDKInitEvent.INITIALIZE_COMPLETE) {
              SDKManager.getInstance().registerApp()
            }
          }

          override fun onDatabaseDownloadProgress(current: Long, total: Long) {
            // Handle database download progress if needed
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
