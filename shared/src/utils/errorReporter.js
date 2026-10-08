/**
 * Every error a person hits, sent to Admin → Live errors (server telemetry/errors).
 *
 * One reporter for all five apps: screen crashes (ErrorBoundary), uncaught
 * errors and rejected promises (installed once, below), and failed requests
 * (services/api). Who it happened to comes from their own token, verified on
 * the server. Best-effort and quiet: the same error is sent at most once every
 * 30 s and no more than 30 a minute, and a report never throws.
 */

const URL_ = `${import.meta.env.VITE_API_URL || ''}/api/telemetry/client-error`;
const APP = typeof window !== 'undefined' ? (window.location.hostname.split('.')[0] || 'web') : 'web';
const RELEASE = import.meta.env.VITE_RELEASE || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || '';

let tokenOf = () => null;
/** services/api tells the reporter how to read the signed-in person's token. */
export function setReporterToken(fn) { tokenOf = fn; }

const recent = new Map();
let minute = 0; let sentThisMinute = 0;

/** Noise browsers and extensions make that no one can act on. */
const NOISE = /ResizeObserver loop|Script error\.?$|Non-Error promise rejection captured|AbortError|The user aborted a request|chrome-extension:|moz-extension:/i;

export function reportError({ kind = 'js', message, stack = '', componentStack = '', api = null, severity = 'error', healed = false }) {
  try {
    const msg = String(message || '').slice(0, 500);
    if (!msg || NOISE.test(msg) || NOISE.test(stack)) return;
    const key = `${kind}|${msg}|${api?.url || window.location.pathname}`;
    const now = Date.now();
    if (now - (recent.get(key) || 0) < 30000) return;
    recent.set(key, now);
    if (recent.size > 200) recent.clear();
    const m = Math.floor(now / 60000);
    if (m !== minute) { minute = m; sentThisMinute = 0; }
    if (++sentThisMinute > 30) return;

    const payload = JSON.stringify({
      kind, severity, message: msg, errorStack: String(stack).slice(0, 3000), stack: String(componentStack).slice(0, 1500),
      path: window.location.pathname + window.location.search, app: APP, healed, api, release: RELEASE,
      auth: tokenOf() || null, at: now,
    });
    if (navigator.sendBeacon) navigator.sendBeacon(URL_, payload);
    else fetch(URL_, { method: 'POST', body: payload, keepalive: true }).catch(() => {});
  } catch { /* reporting must never break the page */ }
}

/** A failed request, in the shape the console groups by: method, endpoint, status, code. */
export function reportApiFailure(args, error) {
  const url = typeof args === 'string' ? args : args?.url || '';
  if (/\/telemetry\/|\/auth\/refresh/.test(url)) return;
  const status = typeof error?.status === 'number' ? error.status : 0;
  if (status === 401) return; // a sign-in refresh, handled
  const network = ['FETCH_ERROR', 'TIMEOUT_ERROR', 'PARSING_ERROR'].includes(error?.status);
  reportError({
    kind: 'api',
    severity: status >= 500 || network ? 'error' : 'warning',
    message: error?.data?.error || error?.error || (network ? `${error.status}: could not reach the server` : `Request failed (${status})`),
    api: {
      method: (typeof args === 'string' ? 'GET' : args?.method || 'GET').toUpperCase(),
      url, status: status || 0, code: error?.data?.code || (network ? error.status : ''), requestId: error?.data?.requestId || '',
    },
  });
}

/* Uncaught errors and rejected promises, once per page. */
if (typeof window !== 'undefined' && !window.__zappyErrorsInstalled) {
  window.__zappyErrorsInstalled = true;
  window.addEventListener('error', (e) => {
    // A failed <script>/<img> load has no error object; a code error does.
    if (!e.error && e.target && e.target !== window) return;
    reportError({ kind: 'js', message: e.message || e.error?.message, stack: e.error?.stack || `${e.filename || ''}:${e.lineno || ''}` });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    // Failed requests are already reported, with more detail, by services/api.
    if (r && typeof r === 'object' && 'status' in r && 'data' in r) return;
    reportError({ kind: 'js', message: r?.message || String(r), stack: r?.stack || '' });
  });
}
