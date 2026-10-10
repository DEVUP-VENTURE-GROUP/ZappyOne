import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectAuth } from '../modules/auth/authSlice';
import { getSocket } from '../services/socket';
import { API_BASE } from '../services/apiBase';
import { useGeolocation } from './useGeolocation';

/**
 * Live tracking for a job someone travels to: a repair, a pet booking or a
 * helping task — both ends of the same wire.
 *
 * `useTrackingFeed` is the customer watching their pro approach.
 * `usePublishTripLocation` is the pro's phone doing the reporting.
 *
 * They are separate hooks because they run on separate devices and have
 * opposite failure modes: the customer's side must degrade to "no map yet"
 * silently, while the pro's side must stop the moment the trip ends — a
 * location feed that outlives its job is how an app ends up tracking a person
 * rather than a delivery.
 *
 * These jobs' events travel on the same room as orders (keyed by the job id),
 * so this deliberately does NOT reuse useOrderSocket: that hook dispatches into
 * the order slice and raises order-shaped toasts, which would be wrong here.
 */

/**
 * When the pro is travelling, and to where — the same rules the server applies
 * in worker/active-trip.js. `toCustomer` decides whether the screen says
 * "coming to you" or just shows the trip.
 */
export { TRIPS, tripOf, MOVING_STATUSES } from '../provider/jobFlows';

export function useTrackingFeed(bookingId, { enabled = true, live = enabled } = {}) {
  const { accessToken: token } = useSelector(selectAuth);
  const [workerLocation, setWorkerLocation] = useState(null);
  const [etaMinutes, setEtaMinutes] = useState(null);

  useEffect(() => {
    // In the room for the whole job (`live`), so status changes arrive too;
    // positions are only kept while the pro is travelling (`enabled`).
    if (!bookingId || !token || !live) return undefined;

    const socket = getSocket(token);
    const subscribe = () => socket.emit('order:subscribe', { orderId: bookingId });
    subscribe();
    socket.on('connect', subscribe);
    // Redis restarts wipe server-side rooms; the server says so and we rejoin.
    socket.on('server:rooms_reset', subscribe);

    const onLocation = (p) => {
      if (p?.lat == null || p?.lng == null) return;
      setWorkerLocation({ lat: p.lat, lng: p.lng, at: p.at || Date.now() });
    };
    const onEta = (p) => {
      if (p?.etaMinutes != null) setEtaMinutes(p.etaMinutes);
    };

    socket.on('worker.location', onLocation);
    socket.on('eta.update', onEta);

    return () => {
      socket.emit('order:unsubscribe', { orderId: bookingId });
      socket.off('connect', subscribe);
      socket.off('server:rooms_reset', subscribe);
      socket.off('worker.location', onLocation);
      socket.off('eta.update', onEta);
    };
  }, [bookingId, token, live]);

  // Leaving a moving status must clear the marker, not freeze it on screen.
  useEffect(() => {
    if (!enabled) {
      setWorkerLocation(null);
      setEtaMinutes(null);
    }
  }, [enabled]);

  return { workerLocation, etaMinutes };
}

/**
 * The pro's side: report position while, and only while, on the trip.
 *
 * Every ping carries the job id so the server can check the job is theirs
 * and still moving before it shares anything. `navigator.geolocation.watchPosition`
 * fires far more often than anyone needs, so posts are throttled — battery on a
 * working technician's phone is a real constraint, not a detail.
 */
export function usePublishTripLocation(bookingId, active, { minIntervalMs = 10000, asOwner = false } = {}) {
  const { accessToken: token } = useSelector(selectAuth);
  const lastSent = useRef(0);
  /**
   * Three states, not a boolean.
   *
   * "off" was shown for two completely different situations — permission
   * genuinely blocked, and simply not having received the first fix yet — so a
   * technician who HAD granted location was told to grant it. The first GPS fix
   * can take several seconds; that is waiting, not refusal.
   */
  const [sharing, setSharing] = useState('idle');
  const { watch } = useGeolocation();

  useEffect(() => {
    if (!bookingId || !active || !token || !navigator.geolocation) {
      setSharing('idle');
      return undefined;
    }

    setSharing('pending');
    lastSent.current = 0;

    // The app's tuned watch, shared with the order flow — one set of accuracy
    // options for the whole app rather than a third copy that drifts from it.
    const stop = watch(
      (loc) => {
        // A position in hand is the only proof sharing actually works.
        setSharing('sharing');
        const now = Date.now();
        if (now - lastSent.current < minIntervalMs) return;
        lastSent.current = now;

        // A shop owner doing the job themselves reports through the job, not a worker profile.
        fetch(asOwner ? `${API_BASE}/api/jobs/${bookingId}/owner-location` : `${API_BASE}/api/workers/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            lat: loc.lat,
            lng: loc.lng,
            jobId: bookingId,
          }),
          keepalive: true,
        }).catch(() => {
          // Best effort. A dropped ping costs one map update; surfacing it would
          // interrupt someone who is driving.
        });
      },
      (err) => {
        // Only a refusal is a refusal. A timeout means keep waiting — the watch
        // stays live and the next fix flips this back to sharing.
        setSharing(err?.code === err?.PERMISSION_DENIED ? 'denied' : 'pending');
      },
    );

    return () => {
      stop();
      setSharing('idle');
    };
  }, [bookingId, active, token, minIntervalMs, watch]);

  return sharing;
}
