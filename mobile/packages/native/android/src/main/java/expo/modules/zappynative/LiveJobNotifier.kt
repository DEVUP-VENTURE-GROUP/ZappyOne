package expo.modules.zappynative

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

// One notification per job that updates itself as the job moves (on the way, arrived, started, done), like a delivery app's live order card, instead of a new one for every step.
object LiveJobNotifier {
  private const val CHANNEL = "zappy_job_live"
  private val DONE = setOf("completed", "cancelled", "failed")

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL) != null) return
    nm.createNotificationChannel(NotificationChannel(CHANNEL, "Your job, live", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "One card that follows your job from start to finish"
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    })
  }

  fun update(context: Context, data: Map<String, String>) {
    ensureChannel(context)
    val jobId = data["id"] ?: return
    val id = ("live:" + jobId).hashCode()
    val stage = data["stage"] ?: ""
    val step = data["step"]?.toIntOrNull()
    val steps = data["steps"]?.toIntOrNull()
    val done = stage in DONE
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val open = PendingIntent.getActivity(context, id, RingNotifier.appLink(context, data["deepLink"]), flags)
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName).takeIf { it != 0 } ?: context.applicationInfo.icon

    val b = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(icon)
      .setColor(0xFF1F4FD8.toInt())
      .setContentTitle(data["title"] ?: "Your job")
      .setContentText(data["body"] ?: "")
      .setStyle(NotificationCompat.BigTextStyle().bigText(data["body"] ?: ""))
      .setSubText(data["reference"])
      .setContentIntent(open)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      // Each new step makes a sound, so the customer notices the pro has arrived.
      .setOnlyAlertOnce(false)
      .setOngoing(!done)
      .setAutoCancel(done)
    if (!done && step != null && steps != null && steps > 0) b.setProgress(steps, step.coerceIn(0, steps), false)
    if (done) b.setTimeoutAfter(6 * 60 * 60 * 1000L)
    try { NotificationManagerCompat.from(context).notify(id, b.build()) } catch (_: SecurityException) { /* notifications are off for this app */ }
  }
}
