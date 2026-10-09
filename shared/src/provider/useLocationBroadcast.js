import { useEffect, useRef } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { getSocket } from '../services/socket';
import { metresBetween } from '../utils/distance';
import { API_BASE } from '../services/apiBase';

/**
 * While a worker is on duty, stream their position: socket for live tracking,
 * REST every 30 s as the heartbeat that survives a socket reconnect.
 * Client gates (moved 15 m, or 4 s moving / 60 s parked) keep it light; the
 * server applies its own throttle as a second layer.
 */
export function useLocationBroadcast({ isOnline, token, currentOrderId, onPosition, onLost }) {
  const { watch } = useGeolocation();
  const lastRestRef = useRef(0);
  const lastSentRef = useRef(null);
  const handlers = useRef({ onPosition, onLost });
  handlers.current = { onPosition, onLost };

  useEffect(() => {
    if (!isOnline || !token) return undefined;
    const socket = getSocket(token);
    let lastSocket = 0;
    let lastMovedAt = Date.now();

    let lastGoodAt = 0;
    const stop = watch(
      (pos) => {
        const now = Date.now();
        // Rough (network) reading while a good GPS fix is under 2 minutes old: ignore it.
        if (pos.accuracy > 100 && now - lastGoodAt < 120000) return;
        if (pos.accuracy <= 100) lastGoodAt = now;
        handlers.current.onPosition?.(pos);
        const cur = { lat: pos.lat, lng: pos.lng };
        const moved = (lastSentRef.current ? (metresBetween(lastSentRef.current, cur) ?? 999) : 999) >= 15;
        if (moved) lastMovedAt = now;
        const minInterval = now - lastMovedAt > 45000 ? 60000 : 4000;

        if (moved || now - lastSocket >= minInterval) {
          lastSocket = now;
          if (moved) lastSentRef.current = cur;
          socket.emit('worker:location', {
            lat: pos.lat, lng: pos.lng, orderId: currentOrderId,
            hdg: pos.heading ?? null, spd: pos.speed ?? null, acc: pos.accuracy ?? null,
          });
        }

        if (now - lastRestRef.current >= 30000) {
          lastRestRef.current = now;
          fetch(`${API_BASE}/api/workers/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy ?? null, ...(currentOrderId && { orderId: currentOrderId }) }),
          }).catch(() => {});
        }
      },
      () => handlers.current.onLost?.(),
    );
    return () => stop?.();
  }, [isOnline, token, watch, currentOrderId]);
}
