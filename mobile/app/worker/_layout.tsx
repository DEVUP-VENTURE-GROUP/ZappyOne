import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';

/**
 * The worker app is a role-scoped zone with its own login, nested under this
 * Stack — mirrors the top-level app/_layout.tsx's (auth)/(tabs) split. The
 * root layout's guard lets an unauthenticated user reach anything under
 * /worker/* (see its `inWorkerZone` check); this local guard handles the
 * finer-grained routing once inside: bounce to login if not a signed-in
 * worker, bounce to the dashboard if already signed in and sitting on login.
 */
export default function WorkerLayout() {
  const segments = useSegments();
  const router = useRouter();
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const role = useSelector((s: RootState) => s.auth.role);
  const hydrated = useSelector((s: RootState) => s.auth.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    // segments = ['worker', '(auth)' | '(tabs)' | 'kyc', ...]
    // `as string`: typed-routes stale-cache artifact — see root _layout.tsx.
    const inAuthGroup = (segments[1] as string) === '(auth)';
    const isWorkerSession = isAuthenticated && role === 'worker';

    if (!isWorkerSession && !inAuthGroup) {
      router.replace('/worker/login' as never);
    } else if (isWorkerSession && inAuthGroup) {
      router.replace('/worker/dashboard' as never);
    }
  }, [hydrated, isAuthenticated, role, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="kyc" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
