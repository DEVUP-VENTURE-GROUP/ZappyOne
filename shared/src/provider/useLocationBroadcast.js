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

    const stop = watch(
      (pos) => {
        handlers.current.onPosition?.(pos);
        const now = Date.now();
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
            body: JSON.stringify({ lat: pos.lat, lng: pos.lng, ...(currentOrderId && { orderId: currentOrderId }) }),
          }).catch(() => {});
        }
      },
      () => handlers.current.onLost?.(),
    );
    return () => stop?.();
  }, [isOnline, token, watch, currentOrderId]);
}
