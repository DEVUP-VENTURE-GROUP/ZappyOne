package expo.modules.zappyring

import android.app.ActivityManager
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

// Job offers (data "zr" = "offer") ring full-screen while the app is not on screen; every other push goes on to expo-notifications unchanged.
class ZappyRingMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    if (data["zr"] == "offer" && !appOnScreen()) {
      RingNotifier.show(applicationContext, data)
      return
    }
    super.onMessageReceived(remoteMessage)
  }

  // On screen, the app already rings and shows the offer itself; a second ring would be noise.
  private fun appOnScreen(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }
}
