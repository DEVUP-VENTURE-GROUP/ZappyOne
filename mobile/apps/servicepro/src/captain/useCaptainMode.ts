// Online like a ride app's captain: location live with the screen off (persistent ZappyOne notification) and the ZappyOne bubble over other apps while away from the app.
import { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { zappyBubble } from '../../modules/zappy-bubble';
import { locationController, setOnlineNotice } from './backgroundLocation';
import { bubbleOff, onBubbleOff, setBubbleOff } from './bubblePref';

// Asked once per app run while it is not allowed, not once ever: a missed prompt must not leave the bubble off for good.
let askedThisRun = false;

/**
 * `known`: the server's online state has been read (or the account signed out); until then the background task is left as it is.
 * `on`: online on the server (a worker) or Live (a shop), and signed in. Offline always wins, even over a start still in flight (locationController).
 */
export function useCaptainMode({ known, on, role }: { known: boolean; on: boolean; role: string | null }): void {
  // The words on Android's persistent notification, set before any start.
  useEffect(() => {
    setOnlineNotice(role === 'shop' ? 'ZappyOne: your shop is open for jobs' : 'ZappyOne: you are online', 'Getting jobs near you. Tap to open ServicePro.');
  }, [role]);

  // The server's view drives the background task: started when online, stopped when offline or signed out.
  useEffect(() => {
    void locationController.update({ known, online: on });
  }, [known, on]);

  const [hidden, setHidden] = useState(bubbleOff());
  useEffect(() => onBubbleOff(setHidden), []);

  useEffect(() => {
    if (!on || hidden) {
      zappyBubble.hide();
      return undefined;
    }
    // The bubble needs "display over other apps", which only the pro can allow (also in More > ZappyOne bubble).
    if (zappyBubble.available && !zappyBubble.canShow() && !askedThisRun) {
      askedThisRun = true;
      Alert.alert('Turn on the ZappyOne bubble?', 'While you are online, a ZappyOne bubble stays on your phone screen, even when the app is closed. Tap it to come back to a job in one touch.', [
        { text: 'Not now', style: 'cancel', onPress: () => setBubbleOff(true) },
        { text: 'Turn on', onPress: () => zappyBubble.askPermission() },
      ]);
    }

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') zappyBubble.hide();
      else if (s === 'background' && zappyBubble.canShow()) zappyBubble.show();
    });
    return () => { sub.remove(); zappyBubble.hide(); };
  }, [on, hidden]);
}
