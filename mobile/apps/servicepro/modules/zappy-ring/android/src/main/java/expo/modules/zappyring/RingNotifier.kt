package expo.modules.zappyring

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

// Posts the ringing job: full-screen over the lock screen when Android allows it, otherwise a ringing heads-up.
object RingNotifier {
  private const val CHANNEL = "zappy_job_ring"

  fun idFor(jobId: String?) = (jobId ?: "job").hashCode()

  fun appLink(context: Context, deepLink: String?): Intent {
    val path = (deepLink ?: "").trimStart('/')
    val intent = if (path.isNotEmpty()) Intent(Intent.ACTION_VIEW, Uri.parse("zappyone-servicepro://$path")).setPackage(context.packageName)
    else context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
    return intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL) != null) return
    val channel = NotificationChannel(CHANNEL, "New jobs (ring)", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "A new job rings like a call so you never miss it"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 800, 400, 800, 400, 800)
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
      val raw = context.resources.getIdentifier("zappy_ring", "raw", context.packageName)
      if (raw != 0) setSound(Uri.parse("android.resource://${context.packageName}/$raw"),
        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
    }
    nm.createNotificationChannel(channel)
  }

  fun show(context: Context, data: Map<String, String>) {
    ensureChannel(context)
    val jobId = data["id"] ?: data["jobId"]
    val notifId = idFor(jobId)
    val title = data["title"] ?: "New job on ZappyOne"
    val body = data["body"] ?: "Tap to see the job"
    val windowMs = ((data["windowSec"]?.toLongOrNull() ?: 60L).coerceIn(15L, 900L)) * 1000L
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    val screen = Intent(context, IncomingJobActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
      putExtra("title", title); putExtra("body", body); putExtra("deepLink", data["deepLink"])
      putExtra("notifId", notifId); putExtra("until", System.currentTimeMillis() + windowMs)
    }
    val fullScreen = PendingIntent.getActivity(context, notifId, screen, flags)
    val open = PendingIntent.getActivity(context, notifId + 1, appLink(context, data["deepLink"]), flags)

    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName).takeIf { it != 0 } ?: context.applicationInfo.icon
    val n = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(icon)
      .setColor(0xFF1F4FD8.toInt())
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setTimeoutAfter(windowMs)
      .setContentIntent(open)
      .addAction(0, "Open job", open)
      .setFullScreenIntent(fullScreen, true)
      .build()
    try { NotificationManagerCompat.from(context).notify(notifId, n) } catch (_: SecurityException) { /* notifications are off for this app */ }
  }

  fun cancel(context: Context, notifId: Int) = NotificationManagerCompat.from(context).cancel(notifId)
}
