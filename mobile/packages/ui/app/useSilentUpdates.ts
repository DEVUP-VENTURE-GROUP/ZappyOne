/**
 * Over-the-air updates, silently (the way quick-commerce apps ship daily):
 * on launch and whenever the app comes back to the front, look for a new
 * version, download it in the background, and switch to it the moment the
 * person leaves the app. No prompt, no "update" screen, never a reload while
 * someone is using it. Store updates (new native code) stay with UpdateGate.
 *
 * Off in development and in builds without updates; a failed check is
 * silent and simply tries again next time.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { createLogger } from '@zappy/core/lib/logger';

const log = createLogger('ota');
/** At most one check per this long, however often the app is opened. */
const CHECK_EVERY_MS = 10 * 60 * 1000;

export function useSilentUpdates() {
  const lastCheck = useRef(0);
  const ready = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return undefined;

    async function check() {
      if (busy.current || ready.current || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      busy.current = true;
      lastCheck.current = Date.now();
      try {
        const found = await Updates.checkForUpdateAsync();
        if (found.isAvailable) {
          const got = await Updates.fetchUpdateAsync();
          ready.current = got.isNew;
        }
      } catch (err) {
        log.warn('update check failed; trying again later', err);
      } finally {
        busy.current = false;
      }
    }

    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
      // Switch while nobody is looking: they come back to the new version.
      else if (state === 'background' && ready.current) Updates.reloadAsync().catch(() => {});
    });
    return () => sub.remove();
  }, []);
}
