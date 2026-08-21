/**
 * Push notification primitives.
 * ----------------------------------------------------------------------------
 * No React here — permission, token and presentation only. The wiring that
 * decides WHEN to register and WHERE a tap goes lives in
 * `hooks/usePushNotifications`.
 *
 * ── WHY THE *DEVICE* TOKEN, NOT AN EXPO PUSH TOKEN ─────────────────────────
 * The server pushes through firebase-admin: `jobs/notifications.worker.js`
 * calls `sendEachForMulticast` with the raw strings stored on the account's
 * `deviceTokens`. Those must therefore be native FCM (Android) / APNs (iOS)
 * tokens, which is `getDevicePushTokenAsync()`. `getExpoPushTokenAsync()`
 * returns an `ExponentPushToken[…]` addressed to Expo's own relay — the
 * backend would accept it and every send to it would silently fail.
 *
 * ── THE ANDROID CHANNEL ID IS NOT OURS TO CHOOSE ───────────────────────────
 * The server sends `android.notification.channelId: 'zappy_alerts'`. On
 * Android 8+ a notification naming a channel that does not exist is dropped by
 * the OS, so the channel is created here under exactly that id.
 *
 * ── NOTHING HERE LOGS A TOKEN ──────────────────────────────────────────────
 * A push token is an addressable capability: anyone holding it can deliver a
 * notification to that install. It is treated like a credential — never
 * logged, never stored by us, handed straight to the API layer.
 * ----------------------------------------------------------------------------
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createLogger } from './logger';

const log = createLogger('push');

/** Must match `android.notification.channelId` in the server's FCM payload. */
export const ANDROID_CHANNEL_ID = 'zappy_alerts';

export type PushPlatform = 'ios' | 'android';
export interface DeviceToken {
  token: string;
  platform: PushPlatform;
}

/**
 * How a notification behaves while the app is in the FOREGROUND.
 *
 * Safe to present: nothing else in the app renders incoming pushes. The socket
 * layer declares a `notification` event but has no subscriber, so there is no
 * second surface to double up with. If one is added later, this is the single
 * place to suppress the banner.
 *
 * `shouldShowAlert` is deprecated in this version in favour of the
 * banner/list split, so both are set explicitly.
 */
export function configurePushPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      // The badge is a count we do not maintain; setting it here would leave a
      // number on the icon that nothing ever clears.
      shouldSetBadge: false,
    }),
  });
}

/** Create the channel the server's payload names. Android-only, idempotent. */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Zappy alerts',
      description: 'Booking updates, messages and job offers.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  } catch (err) {
    // A missing channel degrades delivery; it must not break startup.
    log.warn('could not create the Android notification channel', err);
  }
}

export type PermissionOutcome = 'granted' | 'denied' | 'undetermined';

/**
 * Ask for permission at most once per install.
 *
 * `getPermissionsAsync` is checked first and the prompt is only raised while
 * the status is still undetermined. Re-prompting a user who already said no is
 * both useless — iOS silently returns denied and Android 13+ ignores the
 * request after two dismissals — and hostile.
 */
export async function ensurePushPermission(): Promise<PermissionOutcome> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';

    // `canAskAgain === false` is a permanent denial: the OS will not show the
    // prompt again, and only Settings can change it.
    if (!current.canAskAgain) return 'denied';
    if (current.status !== 'undetermined') return 'denied';

    const asked = await Notifications.requestPermissionsAsync();
    const outcome: PermissionOutcome = asked.granted ? 'granted' : 'denied';
    log.info(`notification permission ${outcome}`);
    return outcome;
  } catch (err) {
    log.warn('permission check failed', err);
    return 'undetermined';
  }
}

/**
 * The native FCM/APNs token, or null when one cannot be obtained.
 *
 * Returns null rather than throwing on every real-world failure — no Firebase
 * config in the build, no Play Services, a simulator with no APNs entitlement,
 * or no network. Push is an enhancement; the app must run without it.
 */
export async function getDeviceToken(): Promise<DeviceToken | null> {
  if (Platform.OS === 'web') return null;
  try {
    const result = await Notifications.getDevicePushTokenAsync();
    const platform = result.type;
    if (platform !== 'ios' && platform !== 'android') return null;
    if (typeof result.data !== 'string' || !result.data) return null;
    return { token: result.data, platform };
  } catch (err) {
    // Deliberately not logging the error object verbatim at info level — it can
    // carry the FCM sender id. `redact()` handles the rest.
    log.warn('device push token unavailable');
    return null;
  }
}

/** Token rotation. FCM invalidates the old token when it issues a new one. */
export function onPushTokenRotated(
  handler: (next: DeviceToken) => void,
): () => void {
  const sub = Notifications.addPushTokenListener((token) => {
    const platform = token.type;
    if (platform !== 'ios' && platform !== 'android') return;
    if (typeof token.data !== 'string' || !token.data) return;
    handler({ token: token.data, platform });
  });
  return () => sub.remove();
}
