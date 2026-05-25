package expo.modules.djisdk

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.value.camera.CameraMode
import dji.sdk.keyvalue.value.camera.CameraStorageLocation
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.KeyManager
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.datacenter.media.MediaFile
import dji.v5.manager.datacenter.media.MediaFileDownloadListener
import dji.v5.manager.datacenter.media.MediaFileListData
import dji.v5.manager.datacenter.media.MediaFileListDataSource
import dji.v5.manager.datacenter.media.MediaFileListState
import dji.v5.manager.datacenter.media.PullMediaFileListParam
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.Calendar

/**
 * Manages photo-capture sessions:
 *  - Switching camera to photo mode
 *  - Triggering shutter on a fixed interval (saves to drone SD card during flight)
 *  - Post-flight download of files matching the session window to phone storage
 *  - Local capture listing for the in-app gallery
 *
 * Storage layout on phone:
 *   <filesDir>/captures/<sessionId>/<droneFileName>.jpg
 *   <filesDir>/captures/<sessionId>/manifest.json   { sessionId, startedAt, endedAt, intervalMs, shotCount }
 *
 * IMPORTANT: MediaManager.enable() pauses the live video stream. We only call enable() during
 * downloadSessionPhotos and disable it immediately after, so the live preview comes back.
 */
class PhotoCaptureManager(private val context: Context) {
  companion object { private const val TAG = "PhotoCaptureManager" }

  private val timerThread = HandlerThread("PhotoCaptureTimer").apply { start() }
  private val timerHandler = Handler(timerThread.looper)

  private var componentIndex: ComponentIndexType = ComponentIndexType.LEFT_OR_MAIN

  // Active session
  data class Session(
    val sessionId: String,
    val startedAtMs: Long,
    val intervalMs: Long,
    var shotCount: Int = 0,
    var endedAtMs: Long? = null,
  )
  @Volatile var activeSession: Session? = null
    private set

  var onShootResult: ((sessionId: String, shotIndex: Int, success: Boolean, error: String?) -> Unit)? = null
  var onDownloadProgress: ((sessionId: String, fileName: String, downloadedBytes: Long, totalBytes: Long, finished: Boolean) -> Unit)? = null

  // ---------- Camera mode ----------

  fun setCameraMode(mode: CameraMode, onDone: (success: Boolean, error: String?) -> Unit) {
    KeyManager.getInstance().setValue(
      KeyTools.createKey(CameraKey.KeyCameraMode, componentIndex),
      mode,
      object : CommonCallbacks.CompletionCallback {
        override fun onSuccess() { onDone(true, null) }
        override fun onFailure(error: IDJIError) {
          Log.e(TAG, "setCameraMode failed: ${error.description()}")
          onDone(false, error.description())
        }
      }
    )
  }

  // ---------- Shutter ----------

  fun shootPhoto(onDone: (success: Boolean, error: String?) -> Unit) {
    KeyManager.getInstance().performAction(
      KeyTools.createKey(CameraKey.KeyStartShootPhoto, componentIndex),
      object : CommonCallbacks.CompletionCallbackWithParam<EmptyMsg> {
        override fun onSuccess(msg: EmptyMsg?) { onDone(true, null) }
        override fun onFailure(error: IDJIError) {
          Log.e(TAG, "shootPhoto failed: ${error.description()}")
          onDone(false, error.description())
        }
      }
    )
  }

  // ---------- Session timer ----------

  fun startSession(sessionId: String, intervalMs: Long): Boolean {
    if (activeSession != null) {
      Log.w(TAG, "startSession: existing session ${activeSession?.sessionId} still active; ignoring")
      return false
    }
    val session = Session(
      sessionId = sessionId,
      startedAtMs = System.currentTimeMillis(),
      intervalMs = intervalMs.coerceAtLeast(1500L), // hard floor: Mini 3 single-shot can't keep up below this
    )
    activeSession = session
    writeManifest(session)
    Log.d(TAG, "startSession sessionId=$sessionId intervalMs=${session.intervalMs}")
    timerHandler.post(tickRunnable)
    return true
  }

  fun stopSession(): Session? {
    val session = activeSession ?: return null
    timerHandler.removeCallbacks(tickRunnable)
    session.endedAtMs = System.currentTimeMillis()
    activeSession = null
    writeManifest(session)
    Log.d(TAG, "stopSession sessionId=${session.sessionId} shotCount=${session.shotCount}")
    return session
  }

  private val tickRunnable = object : Runnable {
    override fun run() {
      val session = activeSession ?: return
      shootPhoto { success, error ->
        val index = session.shotCount + 1
        if (success) {
          session.shotCount = index
          writeManifest(session)
        }
        onShootResult?.invoke(session.sessionId, index, success, error)
      }
      // Schedule next tick regardless of success — failed shutter shouldn't break the cadence
      timerHandler.postDelayed(this, session.intervalMs)
    }
  }

  // ---------- Local storage helpers ----------

  private fun capturesRoot(): File = File(context.filesDir, "captures").apply { if (!exists()) mkdirs() }
  private fun sessionDir(sessionId: String): File =
    File(capturesRoot(), sessionId).apply { if (!exists()) mkdirs() }
  private fun manifestFile(sessionId: String): File = File(sessionDir(sessionId), "manifest.json")

  private fun writeManifest(session: Session) {
    try {
      val json = JSONObject().apply {
        put("sessionId", session.sessionId)
        put("startedAt", session.startedAtMs)
        put("endedAt", session.endedAtMs ?: JSONObject.NULL)
        put("intervalMs", session.intervalMs)
        put("shotCount", session.shotCount)
      }
      manifestFile(session.sessionId).writeText(json.toString())
    } catch (e: Exception) {
      Log.w(TAG, "writeManifest failed: ${e.message}")
    }
  }

  fun readManifest(sessionId: String): JSONObject? {
    val f = manifestFile(sessionId)
    if (!f.exists()) return null
    return try { JSONObject(f.readText()) } catch (e: Exception) { null }
  }

  fun listSessionIds(): List<String> =
    capturesRoot().listFiles()?.filter { it.isDirectory }?.map { it.name }?.sortedDescending() ?: emptyList()

  fun listCapturesInSession(sessionId: String): List<File> =
    sessionDir(sessionId).listFiles()?.filter { it.isFile && it.name.endsWith(".jpg", ignoreCase = true) }
      ?.sortedBy { it.name } ?: emptyList()

  fun listAllCaptures(): List<File> =
    listSessionIds().flatMap { listCapturesInSession(it) }

  fun deleteCapture(absolutePath: String): Boolean {
    val f = File(absolutePath)
    if (!f.exists() || !f.absolutePath.startsWith(capturesRoot().absolutePath)) return false
    return f.delete()
  }

  // ---------- Bulk download (post-flight) ----------

  /**
   * Downloads every photo on the drone's SD card created within the session window.
   * Calls onComplete(downloadedCount, skippedCount, errorOrNull) when finished.
   */
  fun downloadSessionPhotos(
    sessionId: String,
    onComplete: (downloaded: Int, skipped: Int, error: String?) -> Unit
  ) {
    val manifest = readManifest(sessionId)
    if (manifest == null) {
      onComplete(0, 0, "No manifest for session $sessionId")
      return
    }
    val startedAt = manifest.getLong("startedAt")
    // 60s buffer to catch photos written just after stopSession (shutter race)
    val endedAt = (manifest.optLong("endedAt", System.currentTimeMillis())) + 60_000L

    val mediaManager = MediaDataCenter.getInstance().mediaManager
    mediaManager.enable(object : CommonCallbacks.CompletionCallback {
      override fun onSuccess() {
        val source = MediaFileListDataSource.Builder()
          .setIndexType(componentIndex)
          .setLocation(CameraStorageLocation.SDCARD)
          .build()
        mediaManager.setMediaFileDataSource(source)
        mediaManager.pullMediaFileListFromCamera(
          // -1 / -1 = "all files from the start". DJI rejects fixed index/count
          // ranges on several cameras (causes FETCH_FILE_LIST_FAILED), so always
          // request the full list. We filter to the session window ourselves.
          PullMediaFileListParam.Builder().mediaFileIndex(-1).count(-1).build(),
          object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
              val data: MediaFileListData? = mediaManager.mediaFileListData
              val files = data?.data ?: emptyList()
              val toDownload = files.filter {
                if (!it.fileName.endsWith(".JPG", ignoreCase = true)) return@filter false
                val createdMs = mediaFileCreatedMs(it) ?: return@filter false
                createdMs in startedAt..endedAt
              }
              Log.d(TAG, "downloadSessionPhotos sessionId=$sessionId matched=${toDownload.size}/${files.size} window=[$startedAt,$endedAt]")
              downloadSequentially(sessionId, toDownload, 0, 0, 0) { downloaded, skipped, error ->
                disableMediaManagerThen { onComplete(downloaded, skipped, error) }
              }
            }
            override fun onFailure(error: IDJIError) {
              disableMediaManagerThen { onComplete(0, 0, "pullMediaFileList failed: ${error.description()}") }
            }
          }
        )
      }
      override fun onFailure(error: IDJIError) {
        onComplete(0, 0, "mediaManager.enable failed: ${error.description()}")
      }
    })
  }

  private fun disableMediaManagerThen(then: () -> Unit) {
    MediaDataCenter.getInstance().mediaManager.disable(object : CommonCallbacks.CompletionCallback {
      override fun onSuccess() { then() }
      override fun onFailure(error: IDJIError) {
        Log.w(TAG, "mediaManager.disable failed: ${error.description()}")
        then()
      }
    })
  }

  private fun downloadSequentially(
    sessionId: String,
    files: List<MediaFile>,
    index: Int,
    downloaded: Int,
    skipped: Int,
    onAllDone: (downloaded: Int, skipped: Int, error: String?) -> Unit,
  ) {
    if (index >= files.size) {
      onAllDone(downloaded, skipped, null)
      return
    }
    val mediaFile = files[index]
    val outFile = File(sessionDir(sessionId), mediaFile.fileName)
    if (outFile.exists() && outFile.length() > 0) {
      // Already downloaded — skip
      downloadSequentially(sessionId, files, index + 1, downloaded, skipped + 1, onAllDone)
      return
    }
    val tmpFile = File(sessionDir(sessionId), "${mediaFile.fileName}.part")
    val outputStream = FileOutputStream(tmpFile, false)
    val bos = BufferedOutputStream(outputStream)
    mediaFile.pullOriginalMediaFileFromCamera(0L, object : MediaFileDownloadListener {
      override fun onStart() {}
      override fun onProgress(total: Long, current: Long) {
        onDownloadProgress?.invoke(sessionId, mediaFile.fileName, current, total, false)
      }
      override fun onRealtimeDataUpdate(data: ByteArray, position: Long) {
        try { bos.write(data); bos.flush() } catch (e: Exception) { Log.e(TAG, "write failed: ${e.message}") }
      }
      override fun onFinish() {
        try { bos.close(); outputStream.close() } catch (_: Exception) {}
        if (!tmpFile.renameTo(outFile)) {
          Log.w(TAG, "rename tmp -> ${outFile.name} failed")
        }
        onDownloadProgress?.invoke(sessionId, mediaFile.fileName, outFile.length(), outFile.length(), true)
        downloadSequentially(sessionId, files, index + 1, downloaded + 1, skipped, onAllDone)
      }
      override fun onFailure(error: IDJIError?) {
        try { bos.close(); outputStream.close() } catch (_: Exception) {}
        tmpFile.delete()
        Log.e(TAG, "download failed for ${mediaFile.fileName}: ${error?.description()}")
        downloadSequentially(sessionId, files, index + 1, downloaded, skipped, onAllDone)
      }
    })
  }

  fun release() {
    timerHandler.removeCallbacksAndMessages(null)
    timerThread.quitSafely()
    activeSession = null
  }

  /**
   * DJI's MediaFile exposes timestamp as a DateTime wall-clock (year/month/day/hour/min/sec).
   * We convert to epoch ms in the device's local timezone — drones generally use the controller's
   * local time, so this matches the timestamps we recorded for the session window.
   */
  private fun mediaFileCreatedMs(file: MediaFile): Long? {
    val d = file.date ?: return null
    val year = d.year ?: return null
    val month = d.month ?: return null
    val day = d.day ?: return null
    val cal = Calendar.getInstance()
    cal.set(year, month - 1, day, d.hour ?: 0, d.minute ?: 0, d.second ?: 0)
    cal.set(Calendar.MILLISECOND, 0)
    return cal.timeInMillis
  }
}
