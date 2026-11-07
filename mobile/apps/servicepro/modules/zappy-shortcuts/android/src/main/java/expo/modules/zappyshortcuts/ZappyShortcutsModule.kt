package expo.modules.zappyshortcuts

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The app hands over its latest status; the tile and widget redraw from it.
class ZappyShortcutsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZappyShortcuts")

    Function("setStatus") { status: Map<String, Any?> ->
      val context = appContext.reactContext?.applicationContext ?: return@Function
      PhoneStatus.save(
        context,
        status["online"] as? Boolean ?: false,
        (status["jobsToday"] as? Number)?.toInt() ?: 0,
        status["earnedToday"] as? String ?: "₹0",
      )
    }
  }
}
