import { useCallback, useState } from 'react';
import { saveGeoLocation, loadGeoLocation } from '../utils/geoCache';

export { loadGeoLocation };

// High-accuracy one-shot: wait up to 12s, never use cached position.
const OPTS_ONE  = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 };
// Watch: high accuracy, accept positions up to 1s old — fresher reads = smoother customer map.
const OPTS_WATCH = { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 };

// Thresholds
/**
 * Exported as constants, not just returned from the hook, so screens that grade
 * a fix outside a component body can use the same numbers. Two sources of truth
 * for "is this accurate enough" is how a 25km fix ends up labelled "GPS locked".
 */
export const ACCURACY_GOOD_M = 50;   // ≤50m: show as confirmed, green
export const ACCURACY_WARN_M = 150;  // 50–150m: usable, ask them to confirm
export const ACCURACY_BAD_M  = 500;  // >500m: rough area only — pin manually

/**
 * Multi-sample GPS: collect up to `maxSamples` positions within `windowMs`,
 * then return the one with the best (lowest) accuracy value.
 *
 * Why: The first position from `getCurrentPosition` is often a coarse
 * network-based estimate (±200–1500m). Subsequent readings refine to GPS
 * satellite accuracy (±5–30m). Taking the best of N samples instead of the
 * first gives dramatically more accurate pickup coordinates.
 */
function getBestPosition({ maxSamples = 4, windowMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    const samples = [];
    let watchId = null;
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);

      if (samples.length === 0) {
        reject(new Error('No GPS samples collected'));
        return;
      }
      // Pick the sample with lowest accuracy value (= most accurate)
      const best = samples.reduce((a, b) => (a.accuracy <= b.accuracy ? a : b));
      resolve(best);
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const sample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        samples.push(sample);
        // Stop early if we get a very good fix
        if (sample.accuracy <= ACCURACY_GOOD_M || samples.length >= maxSamples) {
          finish();
        }
      },
      (err) => {
        if (samples.length > 0) {
          finish(); // Use what we have
        } else {
          done = true;
          if (watchId !== null) navigator.geolocation.clearWatch(watchId);
          reject(err);
        }
      },
      OPTS_ONE,
    );

    // Hard timeout — resolve with best sample collected so far
    setTimeout(finish, windowMs);
  });
}

export function useGeolocation() {
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState(null);

  /**
   * Get current position using multi-sample accuracy improvement.
   * Returns { lat, lng, accuracy } where accuracy is in metres.
   */
  const getCurrent = useCallback(() => new Promise((resolve, reject) => {
    setLoading(true);
    setError(null);
    getBestPosition({ maxSamples: 4, windowMs: 8000 })
      .then((loc) => {
        setLoading(false);
        saveGeoLocation(loc);
        resolve(loc);
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message);
        reject(err);
      });
  }), []);

  const watch = useCallback((onPos, onErr) => {
    if (!navigator.geolocation) return () => {};
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        saveGeoLocation(loc);
        onPos(loc);
      },
      (err) => onErr?.(err),
      OPTS_WATCH,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return {
    getCurrent,
    watch,
    loading,
    error,
    ACCURACY_GOOD_M,
    ACCURACY_WARN_M,
    ACCURACY_BAD_M,
  };
}
