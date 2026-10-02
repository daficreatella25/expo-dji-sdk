package expo.modules.djisdk

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Log
import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.value.camera.CameraMode
import dji.sdk.keyvalue.value.camera.CameraStorageLocation
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.et.create
import dji.v5.et.get
import dji.v5.manager.KeyManager
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.datacenter.media.MediaFile
import dji.v5.manager.datacenter.media.MediaFileDownloadListener
import dji.v5.manager.datacenter.media.MediaFileListData
import dji.v5.manager.datacenter.media.MediaFileListDataSource
import dji.v5.manager.datacenter.media.PullMediaFileListParam
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.Calendar
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Manages photo-capture sessions:
 *  - Switching camera to photo mode
 *  - Triggering shutter on a fixed interval (saves to drone SD card during flight)
 *  - Post-flight download of files matching the session windows to phone storage
 *  - Local capture listing for the in-app gallery
 *
 * One session per flight: pausing (route paused, drone disconnected) stops the
 * timer and closes the current window; resuming opens a new window in the same
 * session, and starting again with resume=true appends to the existing
 * manifest instead of replacing it. The download keeps photos taken inside any
 * window (5 s before its start to 60 s after its end).
 *
 * Storage layout on phone:
 *   <filesDir>/captures/<sessionId>/<droneFileName>.jpg
 *   <filesDir>/captures/<sessionId>/manifest.json
 *     { sessionId, startedAt, endedAt, intervalMs, shotCount, windows: [{ start, end }] }
 *
 * IMPORTANT: MediaManager.enable() pauses the live video stream. We only call enable() during
 * downloadSessionPhotos and disable it immediately after, so the live preview comes back.
 */
class PhotoCaptureManager(private val context: Context) {
  companion object {
    private const val TAG = "PhotoCaptureManager"
    private const val MIN_INTERVAL_MS = 1500L // hard floor: Mini 3 single-shot can't keep up below this
    // A shutter DJI never answers must not stop the cadence for good.
    private const val SHOT_TIMEOUT_MS = 10_000L
    private const val WINDOW_HEAD_MS = 5_000L // DJI file times are whole seconds (and clocks drift a little)
    private const val WINDOW_TAIL_MS = 60_000L // photos written just after a window closed (shutter race)
    private const val PROGRESS_MIN_INTERVAL_MS = 250L // progress events at most 4 Hz
    private const val CANCEL_FALLBACK_MS = 3_000L
    private val TIMER_TOKEN = Any()
  }

  private val timerThread = HandlerThread("PhotoCaptureTimer").apply { start() }
  private val timerHandler = Handler(timerThread.looper)
  private val lock = Any()

  private var componentIndex: ComponentIndexType = ComponentIndexType.LEFT_OR_MAIN

  /** One stretch of shooting; end is null while it is open. */
  class Window(val startMs: Long, var endMs: Long? = null)

  // Active session (fields guarded by `lock`)
  class Session(
    val sessionId: String,
    val startedAtMs: Long,
    val intervalMs: Long,
    var shotCount: Int = 0,
    var endedAtMs: Long? = null,
    val windows: MutableList<Window> = mutableListOf(),
    var paused: Boolean = false,
  )
  @Volatile var activeSession: Session? = null
    private set

  /** While the route climbs in place (or takes off) every shot would show the same spot. */
  @Volatile private var skipShots = false
  /** Bumped when the timer starts or stops: older ticks and shot answers do not reschedule. */
  private var timerGen = 0

  data class DownloadError(val code: String, val message: String)

  var onShootResult: ((sessionId: String, shotIndex: Int, success: Boolean, error: String?) -> Unit)? = null
  /** [index] is 1-based among the [count] photos of this download. */
  var onDownloadProgress: ((sessionId: String, fileName: String, downloadedBytes: Long, totalBytes: Long, finished: Boolean, index: Int, count: Int) -> Unit)? = null

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

  /**
   * Starts shooting every [intervalMs]. With [resume] and an existing manifest
   * for [sessionId], keeps its startedAt, windows and shot count and opens a
   * new window. Calling it again for the active session just carries on.
   * False when a different session is active.
   */
  fun startSession(sessionId: String, intervalMs: Long, resume: Boolean = false): Boolean {
    synchronized(lock) {
      val active = activeSession
      if (active != null) {
        if (active.sessionId != sessionId) {
          Log.w(TAG, "startSession: existing session ${active.sessionId} still active; ignoring")
          return false
        }
        // Same flight asked again (e.g. JS after a native resume): carry on.
        if (active.paused) resumeLocked(active)
        return true
      }
      val now = System.currentTimeMillis()
      val interval = intervalMs.coerceAtLeast(MIN_INTERVAL_MS)
      val previous = if (resume) readManifest(sessionId) else null
      val session = if (previous != null) {
        Session(
          sessionId = sessionId,
          startedAtMs = previous.optLong("startedAt", now),
          intervalMs = interval,
          shotCount = previous.optInt("shotCount", 0),
          windows = windowsOf(previous, manifestFile(sessionId).lastModified()),
        )
      } else {
        Session(sessionId = sessionId, startedAtMs = now, intervalMs = interval)
      }
      session.windows.add(Window(now))
      activeSession = session
      saveManifest(session)
      Log.d(TAG, "startSession sessionId=$sessionId intervalMs=${session.intervalMs} resume=${previous != null} windows=${session.windows.size}")
      startTimerLocked(session)
      return true
    }
  }

  /** Stops the shutter and closes the current window; the session stays. False without a session. */
  fun pauseSession(): Boolean {
    synchronized(lock) {
      val session = activeSession ?: return false
      if (session.paused) return true
      session.paused = true
      stopTimerLocked()
      closeWindow(session, System.currentTimeMillis())
      saveManifest(session)
      Log.d(TAG, "pauseSession sessionId=${session.sessionId} shotCount=${session.shotCount}")
      return true
    }
  }

  /** Opens a new window and restarts the shutter. False without a session. */
  fun resumeSession(): Boolean {
    synchronized(lock) {
      val session = activeSession ?: return false
      if (session.paused) resumeLocked(session)
      return true
    }
  }

  val isPaused: Boolean
    get() = synchronized(lock) { activeSession?.paused == true }

  fun stopSession(): Session? {
    synchronized(lock) {
      val session = activeSession ?: return null
      stopTimerLocked()
      val now = System.currentTimeMillis()
      closeWindow(session, now)
      session.endedAtMs = now
      session.paused = false
      activeSession = null
      saveManifest(session)
      Log.d(TAG, "stopSession sessionId=${session.sessionId} shotCount=${session.shotCount}")
      return session
    }
  }

  /** The route is climbing in place or taking off: ticks pass without a shot. */
  fun setSkipShots(skip: Boolean) {
    skipShots = skip
  }

  private fun resumeLocked(session: Session) {
    session.paused = false
    session.windows.add(Window(System.currentTimeMillis()))
    saveManifest(session)
    Log.d(TAG, "resumeSession sessionId=${session.sessionId} windows=${session.windows.size}")
    startTimerLocked(session)
  }

  private fun closeWindow(session: Session, now: Long) {
    val last = session.windows.lastOrNull()
    if (last != null && last.endMs == null) last.endMs = now
  }

  private fun startTimerLocked(session: Session) {
    stopTimerLocked()
    val gen = timerGen
    postTick(session, gen, 0L)
  }

  private fun stopTimerLocked() {
    timerGen++
    timerHandler.removeCallbacksAndMessages(TIMER_TOKEN)
  }

  private fun postTick(session: Session, gen: Int, delayMs: Long) {
    timerHandler.postAtTime({ tick(session, gen) }, TIMER_TOKEN, SystemClock.uptimeMillis() + delayMs)
  }

  private fun isCurrent(session: Session, gen: Int): Boolean =
    synchronized(lock) { activeSession === session && !session.paused && gen == timerGen }

  /** On the timer thread. The next tick is scheduled from the shot's answer, so shots never overlap. */
  private fun tick(session: Session, gen: Int) {
    if (!isCurrent(session, gen)) return
    if (skipShots) {
      postTick(session, gen, session.intervalMs)
      return
    }
    val shotAt = SystemClock.uptimeMillis()
    val answered = AtomicBoolean(false)
    val scheduleNext = {
      // Keep the interval cadence, but never start before the previous shot answered.
      val wait = (session.intervalMs - (SystemClock.uptimeMillis() - shotAt)).coerceAtLeast(0L)
      if (isCurrent(session, gen)) postTick(session, gen, wait)
    }
    try {
      shootPhoto { success, error ->
        if (!answered.compareAndSet(false, true)) return@shootPhoto
        timerHandler.post {
          val index: Int
          synchronized(lock) {
            index = session.shotCount + 1
            if (success) {
              session.shotCount = index
              saveManifest(session)
            }
          }
          onShootResult?.invoke(session.sessionId, index, success, error)
          // Failed shutter shouldn't break the cadence
          scheduleNext()
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "shootPhoto threw: ${e.message}")
    }
    timerHandler.postAtTime({
      if (answered.compareAndSet(false, true)) {
        Log.w(TAG, "shutter did not answer within ${SHOT_TIMEOUT_MS / 1000} s; carrying on")
        scheduleNext()
      }
    }, TIMER_TOKEN, shotAt + SHOT_TIMEOUT_MS)
  }

  // ---------- Local storage helpers ----------

  private fun capturesRoot(): File = File(context.filesDir, "captures").apply { if (!exists()) mkdirs() }
  private fun sessionDir(sessionId: String): File =
    File(capturesRoot(), sessionId).apply { if (!exists()) mkdirs() }
  // Reading must not create an empty session folder.
  private fun manifestFile(sessionId: String): File = File(File(capturesRoot(), sessionId), "manifest.json")

  /** Snapshot under the lock; written on the timer thread only (temp file + rename). */
  private fun saveManifest(session: Session) {
    val json = JSONObject().apply {
      put("sessionId", session.sessionId)
      put("startedAt", session.startedAtMs)
      put("endedAt", session.endedAtMs ?: JSONObject.NULL)
      put("intervalMs", session.intervalMs)
      put("shotCount", session.shotCount)
      put("windows", JSONArray().apply {
        session.windows.forEach { w ->
          put(JSONObject().apply {
            put("start", w.startMs)
            put("end", w.endMs ?: JSONObject.NULL)
          })
        }
      })
    }.toString()
    val sessionId = session.sessionId
    timerHandler.post { writeManifest(sessionId, json) }
  }

  private fun writeManifest(sessionId: String, json: String) {
    try {
      val target = File(sessionDir(sessionId), "manifest.json")
      val tmp = File(target.parentFile, "manifest.json.tmp")
      tmp.writeText(json)
      if (!tmp.renameTo(target)) {
        Log.w(TAG, "writeManifest: rename failed")
        tmp.delete()
      }
    } catch (e: Exception) {
      Log.w(TAG, "writeManifest failed: ${e.message}")
    }
  }

  fun readManifest(sessionId: String): JSONObject? {
    val f = manifestFile(sessionId)
    if (!f.exists()) return null
    return try { JSONObject(f.readText()) } catch (e: Exception) { null }
  }

  /**
   * The manifest's windows (closing one left open, e.g. by a crash, at
   * [openEndFallback]); older manifests without windows count as one window.
   */
  private fun windowsOf(manifest: JSONObject, openEndFallback: Long): MutableList<Window> {
    val out = mutableListOf<Window>()
    val array = manifest.optJSONArray("windows")
    if (array != null) {
      for (i in 0 until array.length()) {
        val w = array.optJSONObject(i) ?: continue
        val start = w.optLong("start", 0L)
        if (start <= 0L) continue
        val end = if (w.isNull("end")) null else w.optLong("end")
        out.add(Window(start, end ?: openEndFallback))
      }
    } else {
      val start = manifest.optLong("startedAt", 0L)
      if (start > 0L) {
        val end = if (manifest.isNull("endedAt")) null else manifest.optLong("endedAt")
        out.add(Window(start, end ?: openEndFallback))
      }
    }
    return out
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

  /** One download; completes exactly once. */
  private inner class DownloadRun(
    val sessionId: String,
    private val onComplete: (downloaded: Int, skipped: Int, failed: Int, error: DownloadError?) -> Unit,
  ) {
    @Volatile var cancelled = false
    @Volatile var current: MediaFile? = null
    @Volatile var downloaded = 0
    @Volatile var skipped = 0
    @Volatile var failed = 0
    private val completed = AtomicBoolean(false)

    fun complete(error: DownloadError?, mediaManagerOn: Boolean = true) {
      if (!completed.compareAndSet(false, true)) return
      synchronized(lock) { if (activeDownload === this) activeDownload = null }
      current = null
      val report = { onComplete(downloaded, skipped, failed, error) }
      if (mediaManagerOn) disableMediaManagerThen(report) else report()
    }
  }

  @Volatile private var activeDownload: DownloadRun? = null

  /**
   * Downloads the photos on the drone's SD card taken inside this session's
   * windows. Refuses in the air (IN_FLIGHT), without a manifest (NO_SESSION,
   * no whole-card fallback) and while another download runs (DOWNLOAD_BUSY).
   * Ends with CANCELLED after cancelDownload, STORAGE when the phone cannot
   * store a photo.
   */
  fun downloadSessionPhotos(
    sessionId: String,
    onComplete: (downloaded: Int, skipped: Int, failed: Int, error: DownloadError?) -> Unit
  ) {
    val flying = try { FlightControllerKey.KeyIsFlying.create().get(false) == true } catch (e: Exception) { false }
    if (flying) {
      return onComplete(0, 0, 0, DownloadError("IN_FLIGHT", "Land first: DJI only reads the drone's SD card on the ground"))
    }
    // The flight is over when its photos are fetched: no shutter during the download.
    if (activeSession?.sessionId == sessionId) stopSession()
    val manifest = readManifest(sessionId)
      ?: return onComplete(0, 0, 0, DownloadError("NO_SESSION", "No photos from this flight"))
    val windows = windowsOf(manifest, manifest.optLong("endedAt", 0L).takeIf { it > 0 } ?: System.currentTimeMillis())
    if (windows.isEmpty()) return onComplete(0, 0, 0, DownloadError("NO_SESSION", "No photos from this flight"))
    val ranges = windows.map { (it.startMs - WINDOW_HEAD_MS)..((it.endMs ?: System.currentTimeMillis()) + WINDOW_TAIL_MS) }

    val run = DownloadRun(sessionId, onComplete)
    synchronized(lock) {
      if (activeDownload != null) {
        return onComplete(0, 0, 0, DownloadError("DOWNLOAD_BUSY", "A photo download is already running"))
      }
      activeDownload = run
    }

    val mediaManager = MediaDataCenter.getInstance().mediaManager
    mediaManager.enable(object : CommonCallbacks.CompletionCallback {
      override fun onSuccess() {
        if (run.cancelled) return run.complete(DownloadError("CANCELLED", "Download cancelled"))
        val source = MediaFileListDataSource.Builder()
          .setIndexType(componentIndex)
          .setLocation(CameraStorageLocation.SDCARD)
          .build()
        mediaManager.setMediaFileDataSource(source)
        mediaManager.pullMediaFileListFromCamera(
          // -1 / -1 = "all files from the start". DJI rejects fixed index/count
          // ranges on several cameras (causes FETCH_FILE_LIST_FAILED), so always
          // request the full list. We filter to the session windows ourselves.
          PullMediaFileListParam.Builder().mediaFileIndex(-1).count(-1).build(),
          object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
              val data: MediaFileListData? = mediaManager.mediaFileListData
              val files = data?.data ?: emptyList()
              val toDownload = files.filter { file ->
                if (!file.fileName.endsWith(".JPG", ignoreCase = true)) return@filter false
                val createdMs = mediaFileCreatedMs(file) ?: return@filter false
                ranges.any { createdMs in it }
              }
              Log.d(TAG, "downloadSessionPhotos sessionId=$sessionId matched=${toDownload.size}/${files.size} windows=${ranges.size}")
              downloadFrom(run, toDownload, 0)
            }
            override fun onFailure(error: IDJIError) {
              run.complete(DownloadError("DOWNLOAD_FAILED", "Could not read the drone's photo list: ${error.description()}"))
            }
          }
        )
      }
      override fun onFailure(error: IDJIError) {
        run.complete(DownloadError("DOWNLOAD_FAILED", "Could not open the drone's SD card: ${error.description()}"), mediaManagerOn = false)
      }
    })
  }

  /** Stops the running download (it ends with CANCELLED). False when none runs. */
  fun cancelDownload(): Boolean {
    val run = activeDownload ?: return false
    run.cancelled = true
    try {
      run.current?.stopPullOriginalMediaFileFromCamera(object : CommonCallbacks.CompletionCallback {
        override fun onSuccess() {}
        override fun onFailure(error: IDJIError) { Log.w(TAG, "stop pull: ${error.description()}") }
      })
    } catch (e: Exception) {
      Log.w(TAG, "stop pull threw: ${e.message}")
    }
    // DJI may not answer a stopped pull at all; the download must still end.
    timerHandler.postDelayed({ run.complete(DownloadError("CANCELLED", "Download cancelled")) }, CANCEL_FALLBACK_MS)
    return true
  }

  private fun disableMediaManagerThen(then: () -> Unit) {
    try {
      MediaDataCenter.getInstance().mediaManager.disable(object : CommonCallbacks.CompletionCallback {
        override fun onSuccess() { then() }
        override fun onFailure(error: IDJIError) {
          Log.w(TAG, "mediaManager.disable failed: ${error.description()}")
          then()
        }
      })
    } catch (e: Exception) {
      Log.w(TAG, "mediaManager.disable threw: ${e.message}")
      then()
    }
  }

  private fun downloadFrom(run: DownloadRun, files: List<MediaFile>, from: Int) {
    val dir = sessionDir(run.sessionId)
    var index = from
    // Already on the phone: skip (a loop, not recursion).
    while (index < files.size && File(dir, files[index].fileName).let { it.exists() && it.length() > 0 }) {
      run.skipped++
      index++
    }
    if (run.cancelled) return run.complete(DownloadError("CANCELLED", "Download cancelled"))
    if (index >= files.size) return run.complete(null)

    val mediaFile = files[index]
    val number = index + 1
    val count = files.size
    val outFile = File(dir, mediaFile.fileName)
    val tmpFile = File(dir, "${mediaFile.fileName}.part")
    val out: OutputStream = try {
      BufferedOutputStream(FileOutputStream(tmpFile, false))
    } catch (e: Exception) {
      return run.complete(DownloadError("STORAGE", "The phone could not store ${mediaFile.fileName}: ${e.message}"))
    }
    // Set on DJI's data thread, read when the file ends.
    val writeError = AtomicReference<String?>(null)
    var lastProgressAt = 0L
    val fileDone = AtomicBoolean(false)
    run.current = mediaFile
    try {
      mediaFile.pullOriginalMediaFileFromCamera(0L, object : MediaFileDownloadListener {
        override fun onStart() {}
        override fun onProgress(total: Long, current: Long) {
          val now = SystemClock.uptimeMillis()
          if (now - lastProgressAt < PROGRESS_MIN_INTERVAL_MS && current < total) return
          lastProgressAt = now
          onDownloadProgress?.invoke(run.sessionId, mediaFile.fileName, current, total, false, number, count)
        }
        override fun onRealtimeDataUpdate(data: ByteArray, position: Long) {
          if (writeError.get() != null) return
          try {
            out.write(data)
          } catch (e: Exception) {
            // Storage full (or gone): stop pulling instead of writing a broken photo.
            writeError.set(e.message ?: e.toString())
            Log.e(TAG, "write failed: ${writeError.get()}")
            try {
              mediaFile.stopPullOriginalMediaFileFromCamera(object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() {}
                override fun onFailure(error: IDJIError) {}
              })
            } catch (_: Exception) {}
            // The pull may never answer once stopped.
            timerHandler.postDelayed({ finishFile(null) }, CANCEL_FALLBACK_MS)
          }
        }
        override fun onFinish() = finishFile(null)
        override fun onFailure(error: IDJIError?) = finishFile(error?.description() ?: "unknown error")

        private fun finishFile(pullError: String?) {
          if (!fileDone.compareAndSet(false, true)) return
          val closeError = try { out.close(); null } catch (e: Exception) { e.message ?: e.toString() }
          val storageError = writeError.get() ?: if (pullError == null) closeError else null
          when {
            storageError != null -> {
              tmpFile.delete()
              run.complete(DownloadError("STORAGE", "The phone could not store ${mediaFile.fileName}: $storageError"))
            }
            run.cancelled -> {
              tmpFile.delete()
              run.complete(DownloadError("CANCELLED", "Download cancelled"))
            }
            pullError != null -> {
              tmpFile.delete()
              run.failed++
              Log.e(TAG, "download failed for ${mediaFile.fileName}: $pullError")
              downloadFrom(run, files, index + 1)
            }
            !tmpFile.renameTo(outFile) -> {
              tmpFile.delete()
              run.complete(DownloadError("STORAGE", "The phone could not save ${mediaFile.fileName}"))
            }
            else -> {
              run.downloaded++
              onDownloadProgress?.invoke(run.sessionId, mediaFile.fileName, outFile.length(), outFile.length(), true, number, count)
              downloadFrom(run, files, index + 1)
            }
          }
        }
      })
    } catch (e: Exception) {
      try { out.close() } catch (_: Exception) {}
      tmpFile.delete()
      run.complete(DownloadError("DOWNLOAD_FAILED", "Could not download ${mediaFile.fileName}: ${e.message}"))
    }
  }

  fun release() {
    synchronized(lock) {
      stopTimerLocked()
      activeSession = null
    }
    timerThread.quitSafely()
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
