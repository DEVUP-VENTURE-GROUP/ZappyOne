package expo.modules.zappybubble

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.abs

// The ZappyOne bubble over other apps while a pro is online, like a ride app's: drag it anywhere, tap it to come back.
class ZappyBubbleModule : Module() {
  // One bubble for the whole app process, not this screen: it stays when the app is swiped away (the online notification keeps the process alive) and a reopened app can still remove it.
  companion object {
    private var bubble: View? = null
  }
  private val main = Handler(Looper.getMainLooper())

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("ZappyBubble")

    Function("canDrawOverlays") {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    }

    Function("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("show") { main.post { showBubble() } }

    Function("hide") { main.post { hideBubble() } }
  }

  private fun dp(v: Int) = (v * context.resources.displayMetrics.density).toInt()

  @SuppressLint("ClickableViewAccessibility")
  private fun showBubble() {
    if (bubble != null) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) return
    val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val size = dp(60)

    val frame = FrameLayout(context).apply {
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0xFFFFFFFF.toInt()); setStroke(dp(2), 0xFF1F4FD8.toInt()) }
      elevation = dp(6).toFloat()
      contentDescription = "Open ZappyOne ServicePro"
    }
    val icon = ImageView(context).apply {
      setImageResource(context.applicationInfo.icon)
      scaleType = ImageView.ScaleType.CENTER_CROP
    }
    frame.addView(icon, FrameLayout.LayoutParams(size - dp(12), size - dp(12), Gravity.CENTER))

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    val params = WindowManager.LayoutParams(size, size, type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT).apply {
      gravity = Gravity.TOP or Gravity.START
      x = context.resources.displayMetrics.widthPixels - size - dp(8)
      y = context.resources.displayMetrics.heightPixels / 3
    }

    var startX = 0; var startY = 0; var touchX = 0f; var touchY = 0f; var moved = false
    frame.setOnTouchListener { v, e ->
      when (e.action) {
        MotionEvent.ACTION_DOWN -> { startX = params.x; startY = params.y; touchX = e.rawX; touchY = e.rawY; moved = false; true }
        MotionEvent.ACTION_MOVE -> {
          val dx = (e.rawX - touchX).toInt(); val dy = (e.rawY - touchY).toInt()
          if (abs(dx) > dp(6) || abs(dy) > dp(6)) moved = true
          params.x = startX + dx; params.y = startY + dy
          wm.updateViewLayout(v, params); true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) openApp() else {
            // Snaps to the nearer edge, like a ride app's bubble.
            val w = context.resources.displayMetrics.widthPixels
            params.x = if (params.x + size / 2 < w / 2) dp(8) else w - size - dp(8)
            wm.updateViewLayout(v, params)
          }
          true
        }
        else -> false
      }
    }
    wm.addView(frame, params)
    bubble = frame
  }

  private fun hideBubble() {
    val v = bubble ?: return
    try { (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v) } catch (_: Exception) {}
    bubble = null
  }

  private fun openApp() {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    context.startActivity(launch)
    hideBubble()
  }
}
