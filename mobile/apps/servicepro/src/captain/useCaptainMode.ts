// Online like a ride app's captain: location live with the screen off (persistent ZappyOne notification) and the ZappyOne bubble over other apps while away from the app.
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { zappyBubble } from '../../modules/zappy-bubble';
import { startBackgroundLocation, stopBackgroundLocation } from './backgroundLocation';

const ASKED_KEY = 'zappy_bubble_asked';

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

    // Asked once: the bubble needs "display over other apps", which only the pro can allow.
    if (zappyBubble.available && !zappyBubble.canShow()) {
      SecureStore.getItemAsync(ASKED_KEY).then((asked) => {
        if (asked) return;
        void SecureStore.setItemAsync(ASKED_KEY, '1');
        Alert.alert('Show the ZappyOne bubble?', 'While you are online, a ZappyOne bubble stays on your screen over other apps. Tap it to come back to a job in one touch.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Allow', onPress: () => zappyBubble.askPermission() },
        ]);
      }).catch(() => {});
    }

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') zappyBubble.hide();
      else if (s === 'background' && zappyBubble.canShow()) zappyBubble.show();
    });
    return () => { sub.remove(); zappyBubble.hide(); };
  }, [on, role]);
}
