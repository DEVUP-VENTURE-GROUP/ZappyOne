import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { API_BASE } from '@shared/services/apiBase';

/**
 * useTelemetry — fires lightweight, fire-and-forget analytics beacons that power
 * the admin "Intelligence & Expansion → Live Traffic" dashboard.
 *
 *   - pageview  on every route change (path, referrer, device via UA on server)
 *   - heartbeat every 20s so "active right now" stays accurate
 *
 * Uses navigator.sendBeacon (survives tab close) with a fetch keepalive fallback.
 * Admins are NOT tracked — we don't want the ops team inflating live-visitor counts.
 */

const SESSION_KEY = 'zappy:sid';
const COORDS_KEY  = 'zappy:lastCoords'; // optionally set by the booking LocationPicker
const HEARTBEAT_MS = 20_000;

function getSessionId() {
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid || !/^[A-Za-z0-9_-]{8,64}$/.test(sid)) {
      sid = (crypto?.randomUUID?.() || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`)
        .replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return `s_${Date.now()}`;
  }
}

function lastCoords() {
  try {
    const raw = localStorage.getItem(COORDS_KEY);
    if (!raw) return {};
    const { lat, lng } = JSON.parse(raw);
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  } catch { /* ignore */ }
  return {};
}

/** Send a beacon to /api/telemetry/<endpoint>. Never throws.
 *  IMPORTANT: uses text/plain — a CORS-simple request that needs NO preflight, so
 *  navigator.sendBeacon works across the Vercel→EC2 origin split. An application/json
 *  body would require a preflight that sendBeacon can't do, dropping every event. */
export function sendBeacon(endpoint, body) {
  const url = `${API_BASE}/api/telemetry/${endpoint}`;
  try {
    const payload = JSON.stringify(body);
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(url, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
      if (ok) return;
    }
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: payload, keepalive: true })
      .catch(() => {});
  } catch { /* analytics must never break the app */ }
}

export default function useTelemetry() {
  const location = useLocation();
  const { role, profile } = useSelector(selectAuth);
  const userId = profile?.id || profile?._id || undefined;
  const sidRef = useRef(getSessionId());

  const userType = role === 'worker' ? 'worker'
    : role === 'admin' ? 'admin'
    : role ? 'user'        // user / event_partner
    : 'guest';

  const tracked = userType !== 'admin'; // don't count admins as visitors

  // Pageview on every route change
  useEffect(() => {
    if (!tracked) return;
    sendBeacon('pageview', {
      sessionId: sidRef.current,
      path: location.pathname,
      referrer: document.referrer || null,
      userType,
      userId: userId || undefined,
      ...lastCoords(),
    });
  }, [location.pathname, tracked, userType, userId]);

  // Heartbeat while the tab is visible
  useEffect(() => {
    if (!tracked) return;
    const beat = () => {
      if (document.visibilityState === 'visible') {
        sendBeacon('heartbeat', { sessionId: sidRef.current });
      }
    };
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [tracked]);
}

/** Emit a service-search event (demand intelligence + unmet-demand signal). */
export function trackSearch({ category, query, lat, lng, result, userType, userId } = {}) {
  if (!category) return;
  sendBeacon('search', {
    sessionId: getSessionId(),
    category, query,
    lat, lng,
    result,            // 'served' | 'no_service'
    userType, userId,
  });
}
