/**
 * The phone's position, the same way the websites take it
 * (shared/src/hooks/useGeolocation getBestPosition): watch for up to
 * `windowMs`, stop at a real GPS lock (≤ 30 m), otherwise keep the most
 * accurate reading. The first readings are network guesses, so stopping early
 * would return a guess.
 */
import { useCallback } from 'react';
import * as Location from 'expo-location';

export interface Position { lat: number; lng: number; accuracy: number | null; heading?: number | null; speed?: number | null }

const GPS_LOCK_M = 30;

export class LocationError extends Error {
  constructor(message: string, public code: 'DENIED' | 'UNAVAILABLE') { super(message); }
}

/** Ask for location permission while the app is open. */
export async function ensureLocationPermission(): Promise<void> {
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new LocationError(
      canAskAgain ? 'Allow location so customers near you can find you.' : 'Location is off for this app. Turn it on in Settings to go online.',
      'DENIED',
    );
  }
}

export async function getBestPosition({ windowMs = 10000 } = {}): Promise<Position> {
  await ensureLocationPermission();
  return new Promise<Position>((resolve, reject) => {
    let best: Position | null = null;
    let sub: Location.LocationSubscription | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sub?.remove();
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(new LocationError('Could not find your location. Step outdoors or near a window and try again.', 'UNAVAILABLE'));
    };
    const timer = setTimeout(finish, windowMs);
    Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (loc) => {
      const p: Position = {
        lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? null,
        heading: loc.coords.heading ?? null, speed: loc.coords.speed ?? null,
      };
      if (!best || (p.accuracy ?? Infinity) < (best.accuracy ?? Infinity)) best = p;
      if ((p.accuracy ?? Infinity) <= GPS_LOCK_M) finish();
    }).then((s) => { if (done) s.remove(); else sub = s; }).catch(() => finish());
  });
}

export function useBestPosition() {
  return useCallback((opts?: { windowMs?: number }) => getBestPosition(opts), []);
}
