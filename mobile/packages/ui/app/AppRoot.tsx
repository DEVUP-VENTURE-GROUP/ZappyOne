/**
 * The root of every ZappyOne app.
 * ----------------------------------------------------------------------------
 * One place for what all three apps do the same way:
 *
 *   boot      restore the stored session (and the customer profile) before the
 *             first screen, load the fonts, and never brick on a font failure
 *   guard     signed out → the app's sign-in; signed in on (auth) → home; an
 *             account that belongs to another app is signed out here, so a
 *             customer never lands in Rakshak and a worker never in ServicePro
 *   end       any session end (refresh failure, another device, sign out)
 *             disconnects the socket, clears cached data and goes to sign-in
 *   push      registers the device once signed in and routes taps through the
 *             app's own route table
 *   gestures  one GestureHandlerRootView at the root, so every sheet can swipe
 *
 * Each app passes its roles, its home, and its route table; nothing else
 * differs between them.
 * ----------------------------------------------------------------------------
 */

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { Provider } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { store } from '@zappy/core/store';
import { useAppSelector } from '@zappy/core/store/hooks';
import { getSession, clearSession } from '@zappy/core/api/tokenStorage';
import { apiSlice } from '@zappy/core/api/apiSlice';
import { api } from '@zappy/core/api';
import { setSession, logout as logoutAction } from '@zappy/core/store/authSlice';
import { onSessionEnd } from '@zappy/core/lib/sessionBus';
import { socketClient } from '@zappy/core/socket/socketClient';
import { createLogger } from '@zappy/core/lib/logger';
import { installGlobalErrorHandlers } from '@zappy/core/lib/errorReporter';
import { usePushNotifications } from '@zappy/core/hooks/usePushNotifications';
import type { RouteResolver } from '@zappy/core/lib/pushRouting';
import type { Role } from '@zappy/core/types/api';
import { fontAssets } from '../theme';
import { ToastHost } from '../components/Toast';
import { I18nProvider } from '../lib/i18n';
import { UpdateGate } from './UpdateGate';

// Before any screen runs: a stray error is reported, never shown to the person using the app.
installGlobalErrorHandlers();

const log = createLogger('app-root');

export interface AppRootProps {
  /** Accounts this app signs in. Anything else is signed out on boot. */
  roles: readonly Role[];
  /** Where a signed-in account lands, e.g. '/worker', or per role when one app serves two (ServicePro). */
  home: string | ((role: Role | null) => string);
  /** The app's sign-in screen, e.g. '/(auth)/login'. */
  login: string;
  /** Server deep link → this app's screen, or null. */
  resolveRoute: RouteResolver;
  /**
   * Screens a signed-out guest may see (the customer app's home and catalogue,
   * like the website). Anything else sends them to sign-in, and back to it after.
   * Omitted: every screen needs an account (the provider apps).
   */
  isPublic?: (path: string) => boolean;
  /** The app's Stack screens. */
  children: ReactNode;
}

async function bootstrapSession(roles: readonly Role[]): Promise<void> {
  const session = await getSession();
  if (!session || !roles.includes(session.role)) {
    // No session, or one from another ZappyOne app on a shared device.
    if (session) await clearSession();
    store.dispatch(logoutAction());
    return;
  }
  if (session.role === 'user') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await store.dispatch((api.endpoints as any).getMe.initiate(undefined, { forceRefetch: true }));
      const profile = result?.data?.user ?? result?.data;
      if (profile) {
        store.dispatch(setSession({ user: profile, role: 'user' }));
        return;
      }
      // A 401 here means the refresh itself failed (axiosClient already tried).
      if ('error' in result && (result.error as { status?: number })?.status === 401) {
        await clearSession();
        store.dispatch(logoutAction());
        return;
      }
    } catch (err) {
      log.warn('profile fetch failed during boot; staying signed in', err);
    }
  }
  // A flaky network is not a reason to sign someone out.
  store.dispatch(setSession({ user: null, role: session.role }));
}

function Guarded({ roles, home, login, resolveRoute, isPublic, children }: AppRootProps) {
  const segments = useSegments();
  const pathname = usePathname();
  /** Where a guest was going when sign-in was asked for. */
  const returnTo = useRef<string | null>(null);
  const router = useRouter();
  const [sessionReady, setSessionReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = sessionReady && (fontsLoaded || Boolean(fontError));
  const booted = useRef(false);

  // Subscribed, so signing in re-runs the guard below.
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const role = useAppSelector((s) => s.auth.role);
  const homePath = typeof home === 'function' ? home(role) : home;

  usePushNotifications(resolveRoute);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    bootstrapSession(roles).finally(() => setSessionReady(true));
  }, [roles]);

  useEffect(
    () =>
      onSessionEnd((reason) => {
        if (!store.getState().auth.isAuthenticated) return;
        log.warn('session ended', { reason });
        socketClient.destroy();
        store.dispatch(apiSlice.util.resetApiState());
        store.dispatch(logoutAction());
        router.replace(login as never);
      }),
    [router, login],
  );

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuth) {
      if (isPublic?.(pathname)) return;
      returnTo.current = isPublic ? pathname : null;
      router.replace(login as never);
    } else if (isAuthenticated && inAuth) {
      const next = returnTo.current;
      returnTo.current = null;
      router.replace((next || homePath) as never);
    }
  }, [ready, segments, pathname, router, isAuthenticated, homePath, login, isPublic]);

  if (!ready) return null;
  return <>{children}</>;
}

export function AppRoot(props: AppRootProps) {
  return (
    // Gestures (sheets, swipes) only work beneath this root, so it wraps everything.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <I18nProvider>
          <UpdateGate>
            <Guarded {...props} />
          </UpdateGate>
          <ToastHost />
        </I18nProvider>
      </Provider>
    </GestureHandlerRootView>
  );
}

/** The Stack every app uses: no headers, screens draw their own. */
export function AppStack({ children }: { children?: ReactNode }) {
  return <Stack screenOptions={{ headerShown: false }}>{children}</Stack>;
}
