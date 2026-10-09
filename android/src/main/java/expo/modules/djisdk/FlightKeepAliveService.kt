package expo.modules.djisdk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * Keeps the app process running while a route or a return to start flies the
 * drone: their control loops live in this process, so a locked screen, Doze or
 * the OS reclaiming a background app must not stop them. A foreground service
 * with an ongoing, low-importance notification and a partial wake lock.
 *
 * Started with startService and promoted with startForeground (rather than
 * startForegroundService): if Android refuses the promotion (background start,
 * missing prerequisites) the service simply stops, instead of the app being
 * killed for missing the startForegroundService deadline.
 */
class FlightKeepAliveService : Service() {
  companion object {
    private const val TAG = "FlightKeepAlive"
    private const val CHANNEL_ID = "flight"
    private const val NOTIFICATION_ID = 7342
    // Upper bound so a forgotten stop can never hold the CPU awake for good.
    private const val WAKE_LOCK_TIMEOUT_MS = 3 * 60 * 60 * 1000L

    fun start(context: Context) {
      try {
        context.startService(Intent(context, FlightKeepAliveService::class.java))
      } catch (e: Throwable) {
        // Background start not allowed etc.: fly on without it rather than crash.
        Log.w(TAG, "start refused: ${e.message}")
      }
    }

    fun stop(context: Context) {
      try {
        context.stopService(Intent(context, FlightKeepAliveService::class.java))
      } catch (e: Throwable) {
        Log.w(TAG, "stop failed: ${e.message}")
      }
    }
  }

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Throwable) {
      Log.w(TAG, "startForeground refused: ${e.message}")
      stopSelf()
      return START_NOT_STICKY
    }
    acquireWakeLock()
    Log.i(TAG, "keeping the flight alive")
    // Killed anyway: the control loops are gone with the process, nothing to restart.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    releaseWakeLock()
    try {
      @Suppress("DEPRECATION")
      if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else stopForeground(true)
    } catch (e: Throwable) {
      Log.w(TAG, "stopForeground failed: ${e.message}")
    }
    Log.i(TAG, "stopped")
    super.onDestroy()
  }

  private fun acquireWakeLock() {
    try {
      if (wakeLock?.isHeld == true) return
      val power = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AlphaPilot:flight").apply {
        setReferenceCounted(false)
        acquire(WAKE_LOCK_TIMEOUT_MS)
      }
    } catch (e: Throwable) {
      Log.w(TAG, "wake lock failed: ${e.message}")
    }
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.takeIf { it.isHeld }?.release()
    } catch (e: Throwable) {
      Log.w(TAG, "wake lock release failed: ${e.message}")
    }
    wakeLock = null
  }

  private fun buildNotification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= 26) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Flight", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Shown while the app flies a route or returns the drone"
            setShowBadge(false)
          }
        )
      }
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this).setPriority(Notification.PRIORITY_LOW)
    }
    builder
      .setContentTitle("Alpha Pilot is flying")
      .setContentText("The route and the return keep running with the screen off")
      // A system icon: adaptive launcher icons break small notification icons on some Android 8 builds.
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
    if (Build.VERSION.SDK_INT >= 31) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
      builder.setContentIntent(PendingIntent.getActivity(this, 0, launch, flags))
    }
    return builder.build()
  }
}
