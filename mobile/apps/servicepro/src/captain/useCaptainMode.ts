// Online like a ride app's captain: location live with the screen off (persistent ZappyOne notification) and the ZappyOne bubble over other apps while away from the app.
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { zappyBubble } from '../../modules/zappy-bubble';
import { startBackgroundLocation, stopBackgroundLocation } from './backgroundLocation';

// Asked once per app run while it is not allowed, not once ever: a missed prompt must not leave the bubble off for good.
let askedThisRun = false;

export function useCaptainMode({ on, role }: { on: boolean; role: string | null }): void {
  const running = useRef(false);

  useEffect(() => {
    if (!on) {
      zappyBubble.hide();
      if (running.current) { running.current = false; void stopBackgroundLocation(); }
      return undefined;
    }
    const title = role === 'shop' ? 'ZappyOne: your shop is open for jobs' : 'ZappyOne: you are online';
    void startBackgroundLocation(title, 'Getting jobs near you. Tap to open ServicePro.').then((ok) => { running.current = ok; });

    // The bubble needs "display over other apps", which only the pro can allow (also in More > ZappyOne bubble).
    if (zappyBubble.available && !zappyBubble.canShow() && !askedThisRun) {
      askedThisRun = true;
      Alert.alert('Turn on the ZappyOne bubble?', 'While you are online, a ZappyOne bubble stays on your phone screen, even when the app is closed. Tap it to come back to a job in one touch.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Turn on', onPress: () => zappyBubble.askPermission() },
      ]);
    }

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') zappyBubble.hide();
      else if (s === 'background' && zappyBubble.canShow()) zappyBubble.show();
    });
    return () => { sub.remove(); zappyBubble.hide(); };
  }, [on, role]);
}
