/**
 * Crashes to Admin → Live errors, the same report the websites send
 * (shared/src/utils/errorReporter). Who it happened to comes from the
 * request's own token; the same error is sent at most once in 30 seconds and
 * no more than 30 a minute, so a crash loop cannot flood the server.
 */
import Constants from 'expo-constants';
import { axiosClient } from '../api/axiosClient';
import { APP_ID } from '../config/env';

const recent = new Map<string, number>();
let minute = 0;
let sentThisMinute = 0;

export interface ErrorReport { kind?: 'crash' | 'js'; message: string; stack?: string; componentStack?: string; path?: string; healed?: boolean }

export function reportError({ kind = 'crash', message, stack = '', componentStack = '', path = '', healed = false }: ErrorReport): void {
  try {
    const msg = String(message || '').slice(0, 500);
    if (!msg) return;
    const key = `${kind}|${msg}|${path}`;
    const now = Date.now();
    if (now - (recent.get(key) || 0) < 30000) return;
    recent.set(key, now);
    if (recent.size > 200) recent.clear();
    const m = Math.floor(now / 60000);
    if (m !== minute) { minute = m; sentThisMinute = 0; }
    if (++sentThisMinute > 30) return;

    axiosClient.post('/telemetry/client-error', {
      kind, severity: 'error', message: msg, errorStack: String(stack).slice(0, 3000), stack: String(componentStack).slice(0, 1500),
      path, app: `${APP_ID}-app`, healed, release: Constants.expoConfig?.version || null, at: now,
    }).catch(() => {});
  } catch { /* reporting must never break the app */ }
}
