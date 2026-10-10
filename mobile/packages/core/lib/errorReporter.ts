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

type Handler = (error: unknown, isFatal?: boolean) => void;
interface HermesTracker { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, e: unknown) => void; onHandled: () => void }) => void }
let installed = false;

/**
 * The last safety net, installed once at start-up: a failed promise nobody
 * caught, or a stray error outside a screen, is reported to Admin → Live
 * errors and logged for the developer, never shown to the person using the
 * app. Errors while drawing a screen are caught by ErrorBoundary instead; a
 * truly fatal error still goes to React Native's own handler after reporting.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;
  const text = (e: unknown) => (e instanceof Error ? e : new Error(String((e as { message?: string })?.message ?? e)));
  try {
    const hermes = (globalThis as { HermesInternal?: HermesTracker }).HermesInternal;
    hermes?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, e) => {
        const err = text(e);
        reportError({ kind: 'js', message: `Unhandled promise: ${err.message}`, stack: err.stack, healed: true });
        if (__DEV__) console.log('[unhandled promise]', err.message);
      },
      onHandled: () => {},
    });
  } catch { /* not on Hermes: React Native's default tracking stays */ }
  try {
    const utils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => Handler; setGlobalHandler: (h: Handler) => void } }).ErrorUtils;
    if (!utils) return;
    const previous = utils.getGlobalHandler();
    utils.setGlobalHandler((e, isFatal) => {
      const err = text(e);
      reportError({ kind: isFatal ? 'crash' : 'js', message: err.message, stack: err.stack, healed: !isFatal });
      if (isFatal) previous(e, isFatal);
      else if (__DEV__) console.log('[error]', err.message);
    });
  } catch { /* the default handler stays */ }
}
