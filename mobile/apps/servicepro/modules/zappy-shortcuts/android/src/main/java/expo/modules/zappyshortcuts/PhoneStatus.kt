package expo.modules.zappyshortcuts

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.TileService

// What the app last said (online, today's jobs and money), kept on the phone so the tile and widget can show it with the app closed.
object PhoneStatus {
  private const val PREFS = "zappy_shortcuts"

  fun save(context: Context, online: Boolean, jobsToday: Int, earnedToday: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("online", online).putInt("jobs", jobsToday).putString("earned", earnedToday).apply()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) TileService.requestListeningState(context, ComponentName(context, GoLiveTileService::class.java))
    val wm = AppWidgetManager.getInstance(context)
    val ids = wm.getAppWidgetIds(ComponentName(context, TodayWidget::class.java))
    if (ids.isNotEmpty()) TodayWidget.render(context, wm, ids)
  }

  fun online(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("online", false)
  fun jobs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("jobs", 0)
  fun earned(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("earned", "₹0") ?: "₹0"

  // Opens ServicePro on its home, where the Live switch is.
  fun openApp(context: Context): PendingIntent {
    val launch = (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent())
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(context, 7001, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
