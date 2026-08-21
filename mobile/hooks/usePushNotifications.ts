/**
 * The push notification lifecycle.
 * ----------------------------------------------------------------------------
 * Registers this device against the signed-in account and routes notification
 * taps. Mounted once, from the root layout.
 *
 * ── REGISTRATION IS GATED ON AUTHENTICATION ────────────────────────────────
 * `POST /users/device-token` and `POST /workers/device-token` both `$addToSet`
 * the token onto the CALLER's account, so registering before sign-in would
 * either 401 or attach the device to the wrong account. Nothing runs until
 * `isAuthenticated` is true, and the role decides which of the two endpoints
 * is used.
 *
 * ── A TAP IS AN UNTRUSTED INPUT ────────────────────────────────────────────
 * The route comes from a push payload, which is attacker-reachable in the
 * general case. It is never handed to the router as-is: `resolveRoute` (the
 * existing resolver, shared with the in-app notifications list) pattern-matches
 * a known set and returns null for anything else, and `isSafeRoute` below
 * rejects absolute URLs, schemes and traversal before that.
 *
 * ── COLD START NEEDS A HOLDING PEN ─────────────────────────────────────────
 * A tap that launches the app arrives long before the router is mounted or the
 * session has hydrated. Navigating then either no-ops or bounces off the auth
 * guard, so the destination is parked and replayed once both are ready.
 * ----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAppSelector } from '../store/hooks';
import { useRegisterDeviceTokenMutation } from '../services/api/authApi';
import { useRegisterWorkerDeviceTokenMutation } from '../services/api/workerApi';
import { destinationFrom } from '../lib/pushRouting';
import {
  configurePushPresentation,
  ensureAndroidChannel,
  ensurePushPermission,
  getDeviceToken,
  onPushTokenRotated,
  type DeviceToken,
} from '../lib/pushNotifications';
import { createLogger } from '../lib/logger';

const log = createLogger('push');

// Presentation is process-wide and must be set before the first notification
// can arrive, so it is configured at module scope rather than in an effect.
configurePushPresentation();

export function usePushNotifications(): void {
  const router = useRouter();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const role = useAppSelector((s) => s.auth.role);
  const hydrated = useAppSelector((s) => s.auth.hydrated);

  const [registerUserToken] = useRegisterDeviceTokenMutation();
  const [registerWorkerToken] = useRegisterWorkerDeviceTokenMutation();

  /** Last token+role we successfully sent, so a re-render doesn't re-POST. */
  const registered = useRef<string | null>(null);
  /** A tap that arrived before we could act on it. */
  const pendingRoute = useRef<string | null>(null);
  /** Cold-start response is consumed once; a remount must not replay it. */
  const coldStartHandled = useRef(false);

  const send = useCallback(
    async ({ token, platform }: DeviceToken) => {
      const signature = `${role}:${token}`;
      if (registered.current === signature) return;
      try {
        if (role === 'worker') {
          await registerWorkerToken({ token, platform }).unwrap();
        } else {
          await registerUserToken({ token, platform }).unwrap();
        }
        registered.current = signature;
        log.info('device registration succeeded');
      } catch {
        // Never fatal. No token, no push — the app is otherwise unaffected, and
        // the next sign-in or token rotation retries.
        log.warn('device registration failed');
      }
    },
    [role, registerUserToken, registerWorkerToken],
  );

  /** Navigate now if we can, otherwise park it. */
  const go = useCallback(
    (route: string | null) => {
      if (!route) return;
      if (!hydrated || !isAuthenticated) {
        pendingRoute.current = route;
        return;
      }
      router.push(route as never);
    },
    [router, hydrated, isAuthenticated],
  );

  // ── Register once signed in ──────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      // A different account may sign in on this device next. Clearing the
      // cache guarantees the next session re-registers rather than assuming
      // the previous POST still stands.
      registered.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      await ensureAndroidChannel();
      const permission = await ensurePushPermission();
      if (permission !== 'granted' || cancelled) return;

      const token = await getDeviceToken();
      if (!token || cancelled) return;
      await send(token);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, role, send]);

  // ── Token rotation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    return onPushTokenRotated((next) => {
      // A rotation invalidates the previous token, so the guard must not
      // suppress this POST.
      registered.current = null;
      void send(next);
    });
  }, [isAuthenticated, send]);

  // ── Taps ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      go(destinationFrom(response));
    });
    return () => sub.remove();
  }, [go]);

  // ── Cold start ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (coldStartHandled.current) return;
    coldStartHandled.current = true;
    (async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        const route = destinationFrom(response);
        if (route) pendingRoute.current = route;
      } catch {
        // No launch notification, or the module is unavailable on this target.
      }
    })();
  }, []);

  // ── Replay a parked destination once the app can actually navigate ───────
  useEffect(() => {
    if (!hydrated || !isAuthenticated) return;
    const route = pendingRoute.current;
    if (!route) return;
    pendingRoute.current = null;
    router.push(route as never);
  }, [hydrated, isAuthenticated, router]);

  // ── Signing out drops anything still parked ──────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) pendingRoute.current = null;
  }, [isAuthenticated]);
}
