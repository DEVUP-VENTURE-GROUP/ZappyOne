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
 *
 * Each app passes its roles, its home, and its route table; nothing else
 * differs between them.
 * ----------------------------------------------------------------------------
 */

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { Provider } from 'react-redux';
import { store } from '@zappy/core/store';
import { useAppSelector } from '@zappy/core/store/hooks';
import { getSession, clearSession } from '@zappy/core/api/tokenStorage';
import { apiSlice } from '@zappy/core/api/apiSlice';
import { api } from '@zappy/core/api';
import { setSession, logout as logoutAction } from '@zappy/core/store/authSlice';
import { onSessionEnd } from '@zappy/core/lib/sessionBus';
import { socketClient } from '@zappy/core/socket/socketClient';
import { createLogger } from '@zappy/core/lib/logger';
import { usePushNotifications } from '@zappy/core/hooks/usePushNotifications';
import type { RouteResolver } from '@zappy/core/lib/pushRouting';
import type { Role } from '@zappy/core/types/api';
import { fontAssets } from '../theme';

const log = createLogger('app-root');

export interface AppRootProps {
  /** Accounts this app signs in. Anything else is signed out on boot. */
  roles: readonly Role[];
  /** Where a signed-in account lands, e.g. '/(main)'. */
  home: string;
  /** The app's sign-in screen, e.g. '/(auth)/login'. */
  login: string;
  /** Server deep link → this app's screen, or null. */
  resolveRoute: RouteResolver;
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

function Guarded({ roles, home, login, resolveRoute, children }: AppRootProps) {
  const segments = useSegments();
  const router = useRouter();
  const [sessionReady, setSessionReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = sessionReady && (fontsLoaded || Boolean(fontError));
  const booted = useRef(false);

  // Subscribed, so signing in re-runs the guard below.
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);

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
    if (!isAuthenticated && !inAuth) router.replace(login as never);
    else if (isAuthenticated && inAuth) router.replace(home as never);
  }, [ready, segments, router, isAuthenticated, home, login]);

  if (!ready) return null;
  return <>{children}</>;
}

export function AppRoot(props: AppRootProps) {
  return (
    <Provider store={store}>
      <Guarded {...props} />
    </Provider>
  );
}

/** The Stack every app uses: no headers, screens draw their own. */
export function AppStack({ children }: { children?: ReactNode }) {
  return <Stack screenOptions={{ headerShown: false }}>{children}</Stack>;
}
