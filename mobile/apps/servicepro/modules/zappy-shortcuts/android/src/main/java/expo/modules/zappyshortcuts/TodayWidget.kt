package expo.modules.zappyshortcuts

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

// Home-screen widget: online or off, and today's jobs and earnings, as the app last saw them; a tap opens ServicePro.
class TodayWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = render(context, manager, ids)

  companion object {
    fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
      val pkg = context.packageName
      val res = context.resources
      val layout = res.getIdentifier("zappy_today_widget", "layout", pkg)
      val views = RemoteViews(pkg, layout)
      val on = PhoneStatus.online(context)
      val jobs = PhoneStatus.jobs(context)
      views.setTextViewText(res.getIdentifier("zappy_widget_status", "id", pkg), if (on) "ZappyOne · Online" else "ZappyOne · Offline")
      views.setTextColor(res.getIdentifier("zappy_widget_status", "id", pkg), if (on) 0xFF047857.toInt() else 0xFF475569.toInt())
      views.setTextViewText(res.getIdentifier("zappy_widget_today", "id", pkg), "Today: $jobs job${if (jobs == 1) "" else "s"} · ${PhoneStatus.earned(context)}")
      views.setOnClickPendingIntent(res.getIdentifier("zappy_widget_root", "id", pkg), PhoneStatus.openApp(context))
      ids.forEach { manager.updateAppWidget(it, views) }
    }
  }
}
