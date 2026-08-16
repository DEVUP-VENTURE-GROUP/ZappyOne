import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { fontAssets } from '../theme';
import { Provider } from 'react-redux';
import { store } from '../store';
import '../global.css'; // NativeWind v4 requires this
import { getSession, clearSession } from '../services/api/tokenStorage';
import { apiSlice } from '../services/api/apiSlice';
import { authApi } from '../services/api/authApi';
import { setSession, logout as logoutAction } from '../store/authSlice';
import { onSessionEnd, type SessionEndReason } from '../lib/sessionBus';
import { socketClient } from '../services/socket/socketClient';
import { createLogger } from '../lib/logger';

const log = createLogger('root-layout');

/**
 * Cold-start session bootstrap: read the stored token pair, and — for the
 * customer role this build covers — fetch the real profile via `/users/me`
 * rather than leaving `user: null` until some later screen happens to call
 * it (the previous version never populated it at all).
 */
async function bootstrapSession(): Promise<void> {
  const session = await getSession();
  if (!session) {
    store.dispatch(logoutAction());
    return;
  }

  if (session.role === 'user') {
    try {
      const result = await store.dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }));
      if ('data' in result && result.data) {
        store.dispatch(setSession({ user: result.data, role: 'user' }));
        return;
      }
      if ('error' in result) {
        // A network hiccup shouldn't sign the user out — only a genuine auth
        // rejection should. axiosClient's own 401 interceptor already tried a
        // refresh before this ever surfaces, so a 401 here means the refresh
        // token itself is dead.
        if ((result.error as { status?: number })?.status === 401) {
          await clearSession();
          store.dispatch(logoutAction());
          return;
        }
      }
    } catch (err) {
      log.warn('getMe failed during bootstrap — keeping session, profile will retry', err);
    }
    // Network-flaky but the token pair exists — stay signed in with a null
    // profile; the home screen's own getMe query will retry.
    store.dispatch(setSession({ user: null, role: 'user' }));
    return;
  }

  // Worker/admin roles: this build is customer-only; still mark the session
  // so routing can send them to the (not-yet-built) worker area rather than
  // bouncing them to the customer login.
  store.dispatch(setSession({ user: null, role: session.role }));
}

function RootLayoutNav() {
  const segments = useSegments();
  const router = useRouter();
  const [sessionReady, setSessionReady] = useState(false);
  // A font failure must not brick the app — fall through to the system face.
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = sessionReady && (fontsLoaded || Boolean(fontError));
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    bootstrapSession().finally(() => setSessionReady(true));
  }, []);

  // Any session-ending event (refresh failure, multi-device eviction, manual
  // logout) funnels through here — the single place that owns navigation.
  useEffect(() => {
    return onSessionEnd((reason: SessionEndReason) => {
      log.warn('session ended', { reason });
      // Capture the role BEFORE clearing it — a worker's session ending
      // should return them to the worker login, not the customer one.
      const wasWorker = store.getState().auth.role === 'worker';
      socketClient.destroy();
      store.dispatch(apiSlice.util.resetApiState());
      store.dispatch(logoutAction());
      router.replace((wasWorker ? '/worker/login' : '/(auth)/login') as never);
    });
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    const state = store.getState();
    const inAuthGroup = segments[0] === '(auth)';
    // The worker app is a separate role-scoped zone with its own login —
    // reachable directly (a "Log in as a professional" link from the
    // customer login) without first passing the customer auth guard below.
    // `as string`: typed-routes hasn't rescanned since app/worker/ was
    // restructured — same stale-cache note as the `as never` pushes below.
    const inWorkerZone = (segments[0] as string) === 'worker';

    if (!state.auth.isAuthenticated && !inAuthGroup && !inWorkerZone) {
      router.replace('/(auth)/login');
    } else if (state.auth.isAuthenticated && inAuthGroup) {
      if (state.auth.role === 'worker') {
        // expo-router's typed routes don't know this path yet — the route
        // is real (app/worker/(tabs)/dashboard.tsx; group segments are
        // invisible in the URL, so /worker/dashboard resolves correctly).
        router.replace('/worker/dashboard' as never);
      } else {
        router.replace('/(tabs)/home');
      }
    }
    // A worker landing on /worker/login while already signed in as a worker
    // (e.g. back-navigation) — send them straight to the dashboard. Their
    // own local guard (app/worker/_layout.tsx) also covers this; this is a
    // fast path so there's no flash of the login screen.
    else if (state.auth.isAuthenticated && state.auth.role === 'worker' && inWorkerZone && (segments[1] as string) === '(auth)') {
      router.replace('/worker/dashboard' as never);
    }
  }, [ready, segments, router]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="category/[key]" options={{ headerShown: false }} />
      <Stack.Screen name="worker" options={{ headerShown: false }} />
      <Stack.Screen name="tracking/order/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="chat/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <RootLayoutNav />
    </Provider>
  );
}
