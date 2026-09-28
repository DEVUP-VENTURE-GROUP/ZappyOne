import { useEffect, useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import {
  useRegisterDeviceTokenMutation,
  useRegisterWorkerDeviceTokenMutation,
} from '@shared/services/api';

const {
  VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_VAPID_KEY,
} = import.meta.env;

export const FIREBASE_CONFIGURED =
  !!VITE_FIREBASE_API_KEY &&
  !!VITE_FIREBASE_AUTH_DOMAIN &&
  !!VITE_FIREBASE_PROJECT_ID &&
  !!VITE_FIREBASE_MESSAGING_SENDER_ID &&
  !!VITE_FIREBASE_APP_ID &&
  !!VITE_FIREBASE_VAPID_KEY;

// Permission state exposed so components can render "Enable notifications" banner
let _permissionState = 'unknown'; // 'unknown' | 'granted' | 'denied' | 'not_supported' | 'not_configured'
let _listeners = new Set();

function setPermState(state) {
  _permissionState = state;
  _listeners.forEach((fn) => fn(state));
}

/** Returns current push permission state reactively. */
export function useNotificationPermission() {
  const [state, setState] = useState(_permissionState);
  useEffect(() => {
    setState(_permissionState);
    _listeners.add(setState);
    return () => _listeners.delete(setState);
  }, []);
  return state;
}

export function useFCM() {
  const { accessToken, role } = useSelector(selectAuth);
  const [registerUserToken]   = useRegisterDeviceTokenMutation();
  const [registerWorkerToken] = useRegisterWorkerDeviceTokenMutation();

  // Keep mutation fns in a ref — RTK Query returns new references on every render,
  // but the underlying function is stable. Putting them in a ref prevents them from
  // being deps of useCallback and causing init() to be recreated every render.
  const mutationsRef = useRef({ registerUserToken, registerWorkerToken, role });
  useEffect(() => { mutationsRef.current = { registerUserToken, registerWorkerToken, role }; });

  // True once FCM is fully initialized. Reset to false on logout (token → null → token).
  // This prevents re-registration on every token rotation (15-min refreshes).
  const hasInit = useRef(false);

  const init = useCallback(async () => {
    if (!accessToken) {
      // User logged out — allow re-init on next login.
      hasInit.current = false;
      return;
    }
    // Admins don't receive push notifications — skip entirely.
    if (role === 'admin') return;
    // Already initialized this session — skip (covers token refreshes & visibility events).
    if (hasInit.current) return;

    if (!FIREBASE_CONFIGURED) {
      setPermState('not_configured');
      if (import.meta.env.DEV) {
        console.warn('[FCM] Firebase env vars not set — push notifications disabled.\n'
          + 'Set VITE_FIREBASE_* in .env and restart Vite.');
      }
      return;
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermState('not_supported');
      return;
    }

    // Check current permission without prompting (don't disturb user on background re-init)
    const current = Notification.permission;
    if (current === 'denied') {
      setPermState('denied');
      return;
    }

    try {
      // 1. Request permission — only shows dialog if 'default'
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPermState(permission === 'denied' ? 'denied' : 'unknown');
        return;
      }
      setPermState('granted');

      // 2. Register service worker — pass Firebase config as URL params so the SW
      //    doesn't need to hardcode credentials.
      let swReg;
      try {
        const swParams = new URLSearchParams({
          apiKey:            VITE_FIREBASE_API_KEY,
          authDomain:        VITE_FIREBASE_AUTH_DOMAIN,
          projectId:         VITE_FIREBASE_PROJECT_ID,
          messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId:             VITE_FIREBASE_APP_ID,
        });
        swReg = await navigator.serviceWorker.register(
          `/firebase-messaging-sw.js?${swParams.toString()}`,
          { scope: '/' }
        );
        await navigator.serviceWorker.ready;
      } catch (err) {
        // Fails on plain HTTP (non-localhost). Common in staging over HTTP.
        if (import.meta.env.DEV) console.warn('[FCM] SW registration failed:', err.message);
        return;
      }

      // 3. Lazy-load Firebase SDK
      const { initializeApp, getApps } = await import('firebase/app');
      const { getMessaging, getToken, onMessage } = await import('firebase/messaging');

      const app = getApps().length
        ? getApps()[0]
        : initializeApp({
            apiKey:            VITE_FIREBASE_API_KEY,
            authDomain:        VITE_FIREBASE_AUTH_DOMAIN,
            projectId:         VITE_FIREBASE_PROJECT_ID,
            messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId:             VITE_FIREBASE_APP_ID,
          });

      const messaging = getMessaging(app);

      // 4. Get FCM token
      const fcmToken = await getToken(messaging, {
        vapidKey: VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (!fcmToken) {
        if (import.meta.env.DEV) console.warn('[FCM] getToken returned empty — VAPID key wrong or SW not activated?');
        return;
      }

      // 5. Register with backend — read current role/fns from ref (stable, no re-render deps)
      const { role: currentRole, registerWorkerToken: regWorker, registerUserToken: regUser } = mutationsRef.current;
      const register = currentRole === 'worker' ? regWorker : regUser;
      await register({ token: fcmToken }).unwrap().catch((err) => {
        if (import.meta.env.DEV) console.warn('[FCM] Token registration failed:', err);
      });

      // Mark as initialized — prevents all future calls from re-running until logout.
      hasInit.current = true;
      if (import.meta.env.DEV) console.info('[FCM] Push notifications ready. Token registered.');

      // 6. Foreground message handler — show toast when app is open
      onMessage(messaging, (payload) => {
        // Data-only messages carry title/body in `data` (see notifications.worker.js)
        const d = payload.data || {};
        const title = d.title || payload.notification?.title;
        const body  = d.body  || payload.notification?.body || '';
        if (!title) return;
        const deepLink = d.deepLink;
        import('react-hot-toast').then(({ default: toast }) => {
          toast(
            (t) => (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: deepLink ? 'pointer' : 'default' }}
                onClick={() => {
                  if (deepLink) window.location.href = deepLink;
                  toast.dismiss(t.id);
                }}
              >
                <span style={{ fontSize: 20 }}>🔔</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
                  {body && <div style={{ fontSize: 12, opacity: 0.8 }}>{body}</div>}
                </div>
              </div>
            ),
            {
              duration: 6000,
              style: { background: '#0f172a', color: '#fff', padding: '10px 14px', borderRadius: 14 },
            }
          );
        }).catch(() => {});
      });

    } catch (err) {
      // Don't surface noise for browser-incompatibility codes
      const silentCodes = ['messaging/unsupported-browser', 'messaging/permission-blocked'];
      if (!silentCodes.includes(err?.code)) {
        console.error('[FCM] Init error:', err?.code || err?.message);
      }
    }
  // Only re-run when the user logs in/out (accessToken presence changes).
  // Token refreshes do NOT re-trigger because hasInit guards against them.
  }, [accessToken]);

  useEffect(() => {
    init();

    // Re-check when tab becomes visible — only runs init if not yet initialized
    // (e.g., user granted permission in browser settings while tab was in background).
    function onVisibility() {
      if (document.visibilityState === 'visible') init();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [init]);
}
