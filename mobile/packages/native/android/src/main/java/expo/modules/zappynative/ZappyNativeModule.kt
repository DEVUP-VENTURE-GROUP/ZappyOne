package expo.modules.zappynative

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Lets the app see whether Android allows the full-screen ring (Android 14 asks the user) and open that setting.
class ZappyNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("ZappyNative")

    Function("canFullScreen") {
      if (Build.VERSION.SDK_INT < 34) true
      else context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    }

    Function("openFullScreenSettings") {
      val intent = if (Build.VERSION.SDK_INT >= 34)
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
      else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
