/**
 * While a provider is online, the server knows where they are and that the
 * phone is still with them — the app's version of the websites'
 * OnlineLocation + useLocationBroadcast:
 *
 *   location   watched while the app is open; a rough reading never replaces a
 *              good one under 2 minutes old; sent live over the socket (every
 *              4 s while moving, 60 s when still) and saved over REST every 30 s
 *   heartbeat  every 60 s and whenever the app comes back to the front; if the
 *              server has set them offline, `onWentOffline` is called once
 *   presence   the server's `worker.presence` (lost signal) does the same
 *
 * v1 matches the websites: this runs while the app is open, not in the
 * background.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { socketClient } from '../socket/socketClient';
import { axiosClient } from '../api/axiosClient';
import { metresBetween } from '../shared/distance';
import { useSocketEvent } from './useSocketEvent';

const HEARTBEAT_MS = 60 * 1000;

export function useOnlinePresence({ online, currentOrderId, onWentOffline }: {
  online: boolean;
  currentOrderId?: string | null;
  onWentOffline?: (why: 'heartbeat' | 'no_signal') => void;
}): void {
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);
  const told = useRef(false);
  const cb = useRef(onWentOffline);
  cb.current = onWentOffline;

  useEffect(() => { if (online) told.current = false; }, [online]);

  // Location: watched and sent while online.
  useEffect(() => {
    if (!online) return undefined;
    let sub: Location.LocationSubscription | null = null;
    let stopped = false;
    let lastSocket = 0;
    let lastRest = 0;
    let lastMovedAt = Date.now();
    let lastGoodAt = 0;
    let lastSent: { lat: number; lng: number } | null = null;
    void socketClient.connect();

    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || stopped) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 5 },
        (loc) => {
          const now = Date.now();
          const acc = loc.coords.accuracy ?? null;
          if (acc != null && acc > 100 && now - lastGoodAt < 120000) return;
          if (acc != null && acc <= 100) lastGoodAt = now;
          const cur = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          lastPos.current = cur;
          const moved = (lastSent ? (metresBetween(lastSent, cur) ?? 999) : 999) >= 15;
          if (moved) lastMovedAt = now;
          const minInterval = now - lastMovedAt > 45000 ? 60000 : 4000;
          if (moved || now - lastSocket >= minInterval) {
            lastSocket = now;
            if (moved) lastSent = cur;
            socketClient.emit('worker:location', {
              ...cur,
              ...(currentOrderId ? { orderId: currentOrderId } : {}),
              hdg: loc.coords.heading ?? undefined,
              spd: loc.coords.speed ?? undefined,
              acc: acc ?? undefined,
              mock: (loc as { mocked?: boolean }).mocked ?? undefined,
            });
          }
          if (now - lastRest >= 30000) {
            lastRest = now;
            axiosClient.post('/workers/location', { ...cur, accuracy: acc, ...(currentOrderId ? { orderId: currentOrderId } : {}) }).catch(() => {});
          }
        },
      );
      if (stopped) sub.remove();
    })().catch(() => {});

    return () => { stopped = true; sub?.remove(); };
  }, [online, currentOrderId]);

  // Heartbeat: every minute and on returning to the app.
  useEffect(() => {
    if (!online) return undefined;
    const beat = async () => {
      try {
        const { data } = await axiosClient.post('/workers/heartbeat', lastPos.current || {});
        if (data && data.isOnline === false && !told.current) {
          told.current = true;
          cb.current?.('heartbeat');
        }
      } catch { /* no network: the next beat tries again */ }
    };
    void beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void beat(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [online]);

  // The server took them offline (lost signal).
  useSocketEvent('worker.presence', (p) => {
    if (p?.online === false && !told.current) {
      told.current = true;
      cb.current?.('no_signal');
    }
  }, online);
}
