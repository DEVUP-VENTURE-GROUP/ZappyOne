/**
 * Demand signals for admin's Insights, the same beacons the websites send
 * (client/hooks/useTelemetry): what was searched or opened, where, and whether
 * we serve it. Never throws, never blocks a screen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { axiosClient } from '../api/axiosClient';

const SESSION_KEY = 'zappy:telemetry_sid';
let sessionId: string | null = null;

async function getSessionId(): Promise<string> {
  if (sessionId) return sessionId;
  try {
    const saved = await AsyncStorage.getItem(SESSION_KEY);
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return (sessionId = saved);
  } catch { /* storage unavailable: a fresh id is fine */ }
  sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2)}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  AsyncStorage.setItem(SESSION_KEY, sessionId).catch(() => {});
  return sessionId;
}

export interface SearchSignal { category: string; query?: string; lat?: number | null; lng?: number | null; result: 'served' | 'no_service'; userType?: string }

export function trackSearch(s: SearchSignal): void {
  if (!s.category) return;
  getSessionId()
    .then((sid) => axiosClient.post('/telemetry/search', { sessionId: sid, ...s }))
    .catch(() => {});
}
