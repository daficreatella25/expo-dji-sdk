package expo.modules.djisdk

import android.content.Context
import android.graphics.SurfaceTexture
import android.util.Log
import android.view.Surface
import android.view.TextureView
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.interfaces.ICameraStreamManager
import dji.sdk.keyvalue.value.common.ComponentIndexType
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Renders the DJI camera stream into a TextureView.
 *
 * Why TextureView and not SurfaceView: SurfaceView punches a separate native
 * window *behind* the app's view hierarchy. Inside React Native — which heavily
 * re-renders and which we force into a landscape orientation on this screen —
 * that separate surface gets created and destroyed rapidly during rotation/
 * re-layout (observed in logcat: surface attached then "Surface destroyed" 0.2s
 * later), so the feed never stabilizes. TextureView renders inside the normal
 * view tree, survives RN re-renders and orientation changes, and gives us a
 * Surface (via its SurfaceTexture) we hand to putCameraStreamSurface.
 *
 * Surface attach is gated on camera availability (pushed from the module's
 * AvailableCameraUpdatedListener) so we never attach before MSDK has enumerated
 * the camera.
 */
class CameraStreamView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  companion object {
    private const val TAG = "CameraStreamView"
  }

  private val textureView: TextureView
  private val cameraStreamManager: ICameraStreamManager = MediaDataCenter.getInstance().cameraStreamManager
  private var currentCameraIndex: ComponentIndexType = ComponentIndexType.LEFT_OR_MAIN
  private var isStreamEnabled = false
  private var scaleType: ICameraStreamManager.ScaleType = ICameraStreamManager.ScaleType.CENTER_INSIDE
  private var availableCameras: List<ComponentIndexType> = emptyList()
  private var surface: Surface? = null
  private var attached = false

  init {
    textureView = TextureView(context)
    textureView.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
      override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
        Log.d(TAG, "SurfaceTexture available ${width}x${height}")
        surface = Surface(st)
        tryAttachSurface()
      }

      override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {
        Log.d(TAG, "SurfaceTexture resized ${width}x${height}")
        // Re-attach so the stream matches the new (e.g. post-rotation) size.
        tryAttachSurface()
      }

      override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
        Log.d(TAG, "SurfaceTexture destroyed")
        detachSurface()
        surface?.release()
        surface = null
        return true
      }

      override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}
    }
    addView(textureView)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    ExpoDjiSdkModule.registerStreamView(this)
  }

  override fun onDetachedFromWindow() {
    ExpoDjiSdkModule.unregisterStreamView(this)
    detachSurface()
    super.onDetachedFromWindow()
  }

  fun onAvailableCamerasUpdated(list: List<ComponentIndexType>) {
    val changed = list != availableCameras
    availableCameras = list
    if (changed) {
      Log.d(TAG, "availableCameras → ${list.joinToString { it.name }}; retry attach")
      tryAttachSurface()
    }
  }

  fun setCameraIndex(cameraIndex: Int) {
    val newComponentIndex = ComponentIndexType.find(cameraIndex)
    if (newComponentIndex != currentCameraIndex) {
      Log.d(TAG, "setCameraIndex → $newComponentIndex")
      detachSurface()
      currentCameraIndex = newComponentIndex
      tryAttachSurface()
    }
  }

  fun setStreamEnabled(enabled: Boolean) {
    if (enabled == isStreamEnabled) return
    Log.d(TAG, "setStreamEnabled → $enabled")
    isStreamEnabled = enabled
    if (enabled) tryAttachSurface() else detachSurface()
  }

  fun setScaleType(scaleTypeValue: Int) {
    val newScaleType = ICameraStreamManager.ScaleType.find(scaleTypeValue)
      ?: ICameraStreamManager.ScaleType.CENTER_INSIDE
    if (newScaleType != scaleType) {
      Log.d(TAG, "setScaleType → $newScaleType")
      scaleType = newScaleType
      if (isStreamEnabled) tryAttachSurface()
    }
  }

  /**
   * Attach the texture's surface to the DJI stream manager only when ALL of:
   *  - stream is enabled (consumer asked for it)
   *  - the SurfaceTexture exists and the view is sized
   *  - the target camera is in the available list (DJI pipeline ready)
   */
  private fun tryAttachSurface() {
    if (!isStreamEnabled) return
    if (currentCameraIndex == ComponentIndexType.UNKNOWN) return
    if (currentCameraIndex !in availableCameras) {
      Log.d(TAG, "tryAttachSurface: waiting for $currentCameraIndex (available=${availableCameras.joinToString { it.name }})")
      return
    }
    val s = surface
    if (s == null || !s.isValid || textureView.width <= 0 || textureView.height <= 0) {
      Log.d(TAG, "tryAttachSurface: surface/texture not ready")
      return
    }
    try {
      Log.d(TAG, "putCameraStreamSurface($currentCameraIndex, ${textureView.width}x${textureView.height}, $scaleType)")
      cameraStreamManager.putCameraStreamSurface(
        currentCameraIndex,
        s,
        textureView.width,
        textureView.height,
        scaleType
      )
      attached = true
    } catch (e: Exception) {
      Log.e(TAG, "putCameraStreamSurface failed: ${e.message}", e)
    }
  }

  private fun detachSurface() {
    if (!attached) return
    val s = surface ?: return
    try {
      cameraStreamManager.removeCameraStreamSurface(s)
    } catch (e: Exception) {
      Log.e(TAG, "removeCameraStreamSurface failed: ${e.message}", e)
    }
    attached = false
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    textureView.layout(0, 0, right - left, bottom - top)
  }
}
