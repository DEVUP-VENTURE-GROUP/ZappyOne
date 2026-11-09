// The apps' share of admin App & traffic (the website's useTelemetry): a screen view on each screen change and a heartbeat every 30 s while open, with app, version and phone model; counts only, never the phone's name.
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { axiosClient } from '../api/axiosClient';
import { APP_ID } from '../config/env';
import { useAppSelector } from '../store/hooks';

const BEAT_MS = 30_000;
const NEW_SESSION_AFTER_MS = 30 * 60_000;

const newSession = () => `app_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const model = () => {
  const c = Platform.constants as { Model?: string; Brand?: string } | undefined;
  return [c?.Brand, c?.Model].filter(Boolean).join(' ').slice(0, 60) || null;
};

export function useAppTraffic(): void {
  const path = usePathname();
  const auth = useAppSelector((s) => s.auth);
  const session = useRef(newSession());
  const awayAt = useRef(0);
  const role = auth.isAuthenticated ? auth.role : null;
  const user = auth.user as { _id?: string; id?: string } | null;
  const userId = auth.isAuthenticated ? user?._id || user?.id : undefined;

  // Only the customer and ServicePro apps report; others (Rakshak, on hold) are not part of App & traffic yet.
  const tracked = APP_ID === 'customer' || APP_ID === 'servicepro';

  useEffect(() => {
    if (!path || !tracked) return;
    axiosClient.post('/telemetry/pageview', {
      sessionId: session.current,
      path,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      app: APP_ID === 'servicepro' ? 'servicepro' : 'customer',
      appVersion: Constants.expoConfig?.version || null,
      deviceModel: model(),
      osVersion: Platform.Version,
      userType: role || 'guest',
      ...(userId ? { userId } : {}),
    }).catch(() => { /* analytics never gets in the way */ });
  }, [path, role, userId, tracked]);

  useEffect(() => {
    if (!tracked) return undefined;
    const beat = () => {
      if (AppState.currentState !== 'active') return;
      axiosClient.post('/telemetry/heartbeat', { sessionId: session.current }).catch(() => {});
    };
    const t = setInterval(beat, BEAT_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') { awayAt.current = Date.now(); return; }
      // Back after a long break counts as a new visit, as analytics tools do.
      if (awayAt.current && Date.now() - awayAt.current > NEW_SESSION_AFTER_MS) session.current = newSession();
      awayAt.current = 0;
      beat();
    });
    return () => { clearInterval(t); sub.remove(); };
  }, [tracked]);
}
