package expo.modules.zappyshortcuts

import android.annotation.SuppressLint
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

// The ZappyOne tile in the swipe-down panel: Online or Offline at a glance; a tap opens ServicePro on the Live switch.
class GoLiveTileService : TileService() {
  override fun onStartListening() {
    val tile = qsTile ?: return
    val on = PhoneStatus.online(this)
    tile.state = if (on) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    tile.label = "ZappyOne"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = if (on) "Online" else "Offline"
    tile.updateTile()
  }

  @SuppressLint("StartActivityAndCollapseDeprecated")
  override fun onClick() {
    if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(PhoneStatus.openApp(this))
    else @Suppress("DEPRECATION") startActivityAndCollapse(packageManager.getLaunchIntentForPackage(packageName)!!.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
  }
}
