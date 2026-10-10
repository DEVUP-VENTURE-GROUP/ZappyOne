/**
 * Until an account has what it needs (name, password, email where required),
 * setup covers the app. Then, once each: a photo prompt for accounts that never
 * had one, and "What's new" for anyone who used the app before an update.
 * The navigator stays mounted underneath, so routing never breaks.
 */
import React, { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSegments } from 'expo-router';
import { useAccountMeQuery } from '@zappy/core/api';
import { useSignOut } from '@zappy/core/hooks/useSignOut';
import { RELEASE } from '@zappy/core/shared/releases';
import { useAppSelector } from '@zappy/core/store/hooks';
import { AccountSetup } from './AccountSetup';
import { WhatsNew } from './WhatsNew';

/**
 * Until an account has what it needs (name, password, email where required),
 * setup covers the app. Then, once each: a photo prompt for accounts that
 * never had one, and "What's new" for anyone who used the app before an update.
 * The navigator stays mounted underneath, so routing never breaks.
 */
export function AccountSetupGate({ roles, appName, intro, children }: { roles: readonly string[]; appName: string; intro?: string; children: ReactNode }) {
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const role = useAppSelector((s) => s.auth.role);
  const segments = useSegments();
  const signOut = useSignOut();
  const applies = isAuthenticated && !!role && roles.includes(role) && segments[0] !== '(auth)';
  const { data } = useAccountMeQuery(undefined, { skip: !applies });

  const blocking = applies && (data?.needsSetup || data?.askPhoto);
  // Only for people who used the app before this update; new accounts start on it.
  const before = !data?.joinedAt || new Date(data.joinedAt) < new Date(RELEASE.since);
  const showNews = applies && data && !blocking && before && data.lastSeenRelease !== RELEASE.id;
  return (
    <>
      {children}
      {blocking ? <View style={StyleSheet.absoluteFill}><AccountSetup appName={appName} intro={intro} onSignOut={signOut} /></View> : null}
      {showNews ? <WhatsNew role={data.role} appName={appName} /> : null}
    </>
  );
}
