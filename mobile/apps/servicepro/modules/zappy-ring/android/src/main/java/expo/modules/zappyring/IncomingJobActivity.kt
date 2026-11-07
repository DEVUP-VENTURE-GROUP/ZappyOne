package expo.modules.zappyring

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

// The incoming job over the lock screen, like an incoming call: what and where, a countdown, Open job or Not now.
class IncomingJobActivity : Activity() {
  private val tick = Handler(Looper.getMainLooper())
  private var notifId = 0

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) { setShowWhenLocked(true); setTurnScreenOn(true) }
    else @Suppress("DEPRECATION") window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    notifId = intent.getIntExtra("notifId", 0)
    val until = intent.getLongExtra("until", System.currentTimeMillis() + 60_000)
    val deepLink = intent.getStringExtra("deepLink")
    val dp = resources.displayMetrics.density
    fun px(v: Int) = (v * dp).toInt()

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(Color.parseColor("#0B1220"))
      setPadding(px(24), px(72), px(24), px(40))
    }
    val logo = ImageView(this).apply {
      setImageResource(applicationInfo.icon)
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.WHITE) }
      setPadding(px(10), px(10), px(10), px(10))
    }
    root.addView(logo, LinearLayout.LayoutParams(px(96), px(96)))

    fun label(text: String, size: Float, color: String, bold: Boolean, top: Int) = TextView(this).apply {
      this.text = text; textSize = size; setTextColor(Color.parseColor(color)); gravity = Gravity.CENTER
      if (bold) typeface = Typeface.DEFAULT_BOLD
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = px(top) }
    }
    root.addView(label("ZappyOne ServicePro", 14f, "#94A3B8", false, 20))
    root.addView(label(intent.getStringExtra("title") ?: "New job", 26f, "#FFFFFF", true, 8))
    root.addView(label(intent.getStringExtra("body") ?: "", 17f, "#CBD5E1", false, 12))
    val count = label("", 15f, "#FBBF24", true, 20)
    root.addView(count)

    val spacer = LinearLayout(this)
    root.addView(spacer, LinearLayout.LayoutParams(1, 0, 1f))

    fun button(text: String, bg: String) = Button(this).apply {
      this.text = text; textSize = 18f; setTextColor(Color.WHITE); isAllCaps = false; typeface = Typeface.DEFAULT_BOLD
      background = GradientDrawable().apply { cornerRadius = px(16).toFloat(); setColor(Color.parseColor(bg)) }
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, px(60)).apply { topMargin = px(12) }
    }
    val open = button("Open job", "#16A34A")
    val later = button("Not now", "#334155")
    root.addView(open); root.addView(later)
    setContentView(root)

    open.setOnClickListener {
      RingNotifier.cancel(this, notifId)
      startActivity(RingNotifier.appLink(this, deepLink))
      finish()
    }
    later.setOnClickListener { RingNotifier.cancel(this, notifId); finish() }

    val run = object : Runnable {
      override fun run() {
        val left = ((until - System.currentTimeMillis()) / 1000).toInt()
        if (left <= 0) { RingNotifier.cancel(this@IncomingJobActivity, notifId); finish(); return }
        count.text = "Offer ends in ${left}s"
        tick.postDelayed(this, 1000)
      }
    }
    tick.post(run)
  }

  override fun onDestroy() { tick.removeCallbacksAndMessages(null); super.onDestroy() }
}
