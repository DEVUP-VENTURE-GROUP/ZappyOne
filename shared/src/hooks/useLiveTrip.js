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
const point = (p) => (p?.coordinates?.length === 2 ? { lng: p.coordinates[0], lat: p.coordinates[1], address: p.address || '' } : null);

export const TRIPS = {
  repair: (b) => {
    if (['ON_THE_WAY', 'PICKUP_SCHEDULED'].includes(b.status)) return { to: point(b.location), toCustomer: true };
    if (b.status === 'OUT_FOR_RETURN') return { to: point(b.location), toCustomer: true, returning: true };
    if (b.status === 'DEVICE_PICKED_UP') return { to: null, toCustomer: false };
    return null;
  },
  pet: (b) => {
    if (b.status === 'PROVIDER_EN_ROUTE') return { to: point(b.serviceLocation), toCustomer: true };
    if (b.status === 'SERVICE_STARTED' && b.serviceMode === 'transport') return { to: point(b.destination), toCustomer: false };
    return null;
  },
  helping: (t) => {
    const startsAtCustomer = ['return', 'exchange'].includes(t.serviceType);
    if (t.status === 'EN_ROUTE') return { to: point(t.pickupLocation), toCustomer: startsAtCustomer };
    if (t.status === 'RETURNING') return { to: point(t.destination) || point(t.pickupLocation), toCustomer: !startsAtCustomer };
    return null;
  },
};

/** The trip a job is on right now, or null. */
export function tripOf(kind, job) {
  return job ? TRIPS[kind]?.(job) || null : null;
}

/** Statuses in which a repair technician is genuinely travelling. */
export const MOVING_STATUSES = ['ON_THE_WAY', 'OUT_FOR_RETURN', 'PICKUP_SCHEDULED', 'DEVICE_PICKED_UP'];

/**
 * The customer's side: the technician's latest position, or null.
 *
 * Null is a real answer and is rendered as such — a map with no marker, or no
 * map at all, beats a marker parked at a stale position the customer believes
 * is live.
 */
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
export function usePublishTripLocation(bookingId, active, { minIntervalMs = 10000 } = {}) {
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

        fetch(`${API_BASE}/api/workers/location`, {
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
