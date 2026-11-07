package expo.modules.zappynative

import android.app.ActivityManager
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

// ZappyOne's pushes drawn natively: a job offer (zr) rings full-screen while the app is not on screen; a job update (zl) refreshes that job's one live card. Every other push goes on to expo-notifications unchanged.
class ZappyMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    when {
      data["zr"] == "offer" && !appOnScreen() -> RingNotifier.show(applicationContext, data)
      data["zr"] == "offer" -> super.onMessageReceived(remoteMessage)
      data["zl"] == "job" -> LiveJobNotifier.update(applicationContext, data)
      else -> super.onMessageReceived(remoteMessage)
    }
  }

  // On screen, the app already rings and shows the offer itself; a second ring would be noise.
  private fun appOnScreen(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }
}
