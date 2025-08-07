package expo.modules.djisdk

import android.content.Context
import android.util.Log
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.interfaces.ICameraStreamManager
import dji.sdk.keyvalue.value.common.ComponentIndexType
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class CameraStreamView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  companion object {
    private const val TAG = "CameraStreamView"
  }

  private val surfaceView: SurfaceView
  private val cameraStreamManager: ICameraStreamManager = MediaDataCenter.getInstance().cameraStreamManager
  private var currentCameraIndex: ComponentIndexType = ComponentIndexType.LEFT_OR_MAIN
  private var isStreamEnabled = false
  private var scaleType: ICameraStreamManager.ScaleType = ICameraStreamManager.ScaleType.CENTER_INSIDE

  init {
    surfaceView = SurfaceView(context)
    
    surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
      override fun surfaceCreated(holder: SurfaceHolder) {
        Log.d(TAG, "Surface created")
      }

      override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        Log.d(TAG, "Surface changed - width: $width, height: $height")
        if (isStreamEnabled) {
          putCameraStreamSurface(holder.surface, width, height)
        }
      }

      override fun surfaceDestroyed(holder: SurfaceHolder) {
        Log.d(TAG, "Surface destroyed")
        removeCameraStreamSurface(holder.surface)
      }
    })

    addView(surfaceView)
  }

  fun setCameraIndex(cameraIndex: Int) {
    val newComponentIndex = ComponentIndexType.find(cameraIndex)
    if (newComponentIndex != currentCameraIndex) {
      Log.d(TAG, "Setting camera index to: $cameraIndex ($newComponentIndex)")
      
      // Remove current surface first
      removeCameraStreamSurface(surfaceView.holder.surface)
      
      // Update camera index
      currentCameraIndex = newComponentIndex
      
      // Re-add surface if stream is enabled
      if (isStreamEnabled && surfaceView.width > 0 && surfaceView.height > 0) {
        putCameraStreamSurface(surfaceView.holder.surface, surfaceView.width, surfaceView.height)
      }
    }
  }

  fun setStreamEnabled(enabled: Boolean) {
    Log.d(TAG, "Setting stream enabled: $enabled")
    isStreamEnabled = enabled
    
    if (enabled && surfaceView.width > 0 && surfaceView.height > 0) {
      putCameraStreamSurface(surfaceView.holder.surface, surfaceView.width, surfaceView.height)
    } else {
      removeCameraStreamSurface(surfaceView.holder.surface)
    }
  }

  fun setScaleType(scaleTypeValue: Int) {
    val newScaleType = ICameraStreamManager.ScaleType.find(scaleTypeValue) 
      ?: ICameraStreamManager.ScaleType.CENTER_INSIDE
    
    if (newScaleType != scaleType) {
      Log.d(TAG, "Setting scale type to: $newScaleType")
      scaleType = newScaleType
      
      // Re-add surface with new scale type
      if (isStreamEnabled && surfaceView.width > 0 && surfaceView.height > 0) {
        removeCameraStreamSurface(surfaceView.holder.surface)
        putCameraStreamSurface(surfaceView.holder.surface, surfaceView.width, surfaceView.height)
      }
    }
  }

  private fun putCameraStreamSurface(surface: Surface, width: Int, height: Int) {
    try {
      Log.d(TAG, "Putting camera stream surface - camera: $currentCameraIndex, size: ${width}x${height}, scale: $scaleType")
      cameraStreamManager.putCameraStreamSurface(
        currentCameraIndex,
        surface,
        width,
        height,
        scaleType
      )
    } catch (e: Exception) {
      Log.e(TAG, "Failed to put camera stream surface: ${e.message}", e)
    }
  }

  private fun removeCameraStreamSurface(surface: Surface) {
    try {
      Log.d(TAG, "Removing camera stream surface")
      cameraStreamManager.removeCameraStreamSurface(surface)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to remove camera stream surface: ${e.message}", e)
    }
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    
    // Make sure SurfaceView fills the entire view
    surfaceView.layout(0, 0, right - left, bottom - top)
  }
}