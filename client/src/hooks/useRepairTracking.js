import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { getSocket } from '../services/socket';
import { API_BASE } from '../services/apiBase';
import { useGeolocation } from './useGeolocation';

/**
 * Live tracking for a repair booking — both ends of the same wire.
 *
 * `useRepairTrackingFeed` is the customer watching a technician approach.
 * `usePublishRepairLocation` is the technician's phone doing the reporting.
 *
 * They are separate hooks because they run on separate devices and have
 * opposite failure modes: the customer's side must degrade to "no map yet"
 * silently, while the technician's side must stop the moment the trip ends —
 * a location feed that outlives its job is how an app ends up tracking a person
 * rather than a delivery.
 *
 * Repair events travel on the same room as orders (keyed by the booking id), so
 * this deliberately does NOT reuse useOrderSocket: that hook dispatches into the
 * order slice and raises order-shaped toasts ("Order cancelled"), which would be
 * wrong and confusing on a repair screen.
 */

/** Statuses in which a technician is genuinely travelling. */
export const MOVING_STATUSES = ['ON_THE_WAY', 'OUT_FOR_RETURN', 'PICKUP_SCHEDULED', 'DEVICE_PICKED_UP'];

/**
 * The customer's side: the technician's latest position, or null.
 *
 * Null is a real answer and is rendered as such — a map with no marker, or no
 * map at all, beats a marker parked at a stale position the customer believes
 * is live.
 */
export function useRepairTrackingFeed(bookingId, { enabled = true } = {}) {
  const token = useSelector((s) => s.auth?.token);
  const [workerLocation, setWorkerLocation] = useState(null);
  const [etaMinutes, setEtaMinutes] = useState(null);

  useEffect(() => {
    if (!bookingId || !token || !enabled) return undefined;

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
  }, [bookingId, token, enabled]);

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
 * The technician's side: report position while, and only while, on the trip.
 *
 * Every ping carries the booking id so the server can check the job is theirs
 * and still moving before it shares anything. `navigator.geolocation.watchPosition`
 * fires far more often than anyone needs, so posts are throttled — battery on a
 * working technician's phone is a real constraint, not a detail.
 */
export function usePublishRepairLocation(bookingId, active, { minIntervalMs = 10000 } = {}) {
  const token = useSelector((s) => s.auth?.token);
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
            repairBookingId: bookingId,
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
