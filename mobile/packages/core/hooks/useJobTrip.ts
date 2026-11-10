/**
 * The job screens' location pieces (the websites' useLiveTrip +
 * ArrivalProximity), on the phone's GPS:
 *
 *   useTripPublish      while on a trip leg, share position every 10 s so the
 *                       customer can follow ('idle' | 'pending' | 'sharing' | 'denied');
 *                       a shop owner going themselves posts to the job's owner-location
 *   useMyPosition       the provider's own position, watched while a screen needs it
 *   useArrivalProximity metres to the destination and whether they're within the
 *                       arrival radius (the server's rule, shared distance logic)
 */
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { axiosClient } from '../api/axiosClient';
import { metresBetween, ARRIVAL_RADIUS_M } from '../shared/distance';

export type SharingState = 'idle' | 'pending' | 'sharing' | 'denied';

export function useMyPosition(enabled: boolean): { lat: number; lng: number } | null {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let sub: Location.LocationSubscription | null = null;
    let stopped = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || stopped) return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (l) => setPos({ lat: l.coords.latitude, lng: l.coords.longitude }));
      if (stopped) sub.remove();
    })().catch(() => {});
    return () => { stopped = true; sub?.remove(); };
  }, [enabled]);
  return pos;
}

// The ServicePro app's background location listens here, so it can send precise updates while a trip is on (the job page itself stops sending once Maps is in front).
const tripListeners = new Set<(on: boolean) => void>();
export function onTripChange(fn: (on: boolean) => void): () => void {
  tripListeners.add(fn);
  return () => { tripListeners.delete(fn); };
}

export function useTripPublish(jobId: string | undefined, active: boolean, { asOwner = false, minIntervalMs = 10000 } = {}): SharingState {
  const [sharing, setSharing] = useState<SharingState>('idle');
  const lastSent = useRef(0);
  useEffect(() => {
    if (!jobId || !active) { setSharing('idle'); return undefined; }
    tripListeners.forEach((fn) => fn(true));
    let sub: Location.LocationSubscription | null = null;
    let stopped = false;
    setSharing('pending');
    lastSent.current = 0;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (stopped) return;
      if (status !== 'granted') { setSharing('denied'); return; }
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 5 }, (l) => {
        setSharing('sharing');
        const now = Date.now();
        if (now - lastSent.current < minIntervalMs) return;
        lastSent.current = now;
        const body = { lat: l.coords.latitude, lng: l.coords.longitude, jobId };
        axiosClient.post(asOwner ? `/jobs/${jobId}/owner-location` : '/workers/location', body).catch(() => {});
      });
      if (stopped) sub.remove();
    })().catch(() => setSharing('pending'));
    return () => { stopped = true; sub?.remove(); setSharing('idle'); tripListeners.forEach((fn) => fn(false)); };
  }, [jobId, active, asOwner, minIntervalMs]);
  return sharing;
}

export function useArrivalProximity(destination: number[] | null | undefined, enabled: boolean) {
  const here = useMyPosition(enabled);
  const metres: number | null = metresBetween(here, destination);
  return { metres, withinRadius: metres === null || metres <= ARRIVAL_RADIUS_M, hasFix: here !== null, radius: ARRIVAL_RADIUS_M as number };
}
