import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { setAuth } from '../modules/auth/authSlice';
import { API_BASE } from '../services/apiBase';
import { I18nProvider } from '../i18n/I18nProvider';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ScrollToTop from '../components/common/ScrollToTop';
import { watchForUpdates, applyUpdateIfWaiting } from './appUpdate';

/** A newer version waiting is applied when the screen changes, never in the middle of one. */
function UpdateOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => { applyUpdateIfWaiting(); }, [pathname]);
  return null;
}

const SURFACE = import.meta.env.VITE_CLIENT_SURFACE || '';

function jwtClaims(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

/**
 * The access token lives in memory only, so every load starts signed out and is
 * restored from this app's httpOnly refresh cookie. A session for a role this
 * app does not serve is ignored rather than half-rendered.
 */
async function restoreSession(store, roles) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(SURFACE && { 'X-Client-Type': SURFACE }) },
      body: '{}',
    });
    if (!res.ok) return;
    const data = await res.json();
    const claims = jwtClaims(data.accessToken);
    const role = data.role ?? claims?.role ?? null;
    if (!data.accessToken || (roles && !roles.includes(role))) return;
    let cached = null;
    try { cached = JSON.parse(sessionStorage.getItem('zappy_profile_v2')); } catch { /* none */ }
    // A new tab has no cached profile; the token still names the account and its phone (the OTP checks on money details need it).
    const profile = { ...(cached || {}), sub: cached?.sub ?? claims?.sub, ...(!cached?.phone && claims?.phone && { phone: claims.phone }) };
    store.dispatch(setAuth({ accessToken: data.accessToken, profile, role }));
  } catch { /* offline - stay signed out */ }
}

// Whether this browser was signed in last time; a visitor known to be signed out need not wait for the session check.
const SIGNED_IN_HINT = 'zappy_signed_in';
const readHint = () => { try { return localStorage.getItem(SIGNED_IN_HINT); } catch { return null; } };
const writeHint = (on) => { try { localStorage.setItem(SIGNED_IN_HINT, on ? '1' : '0'); } catch { /* storage blocked */ } };
function trackHint(store) {
  let last = !!store.getState().auth?.accessToken;
  writeHint(last);
  store.subscribe(() => {
    const now = !!store.getState().auth?.accessToken;
    if (now !== last) { last = now; writeHint(now); }
  });
}

// Same look as the boot screen in index.html, so the hand-over is seamless.
const Spinner = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-slate-50">
    <img src="/icons/icon-192.png" width="56" height="56" alt="ZappyOne" className="rounded-[14px]" />
    <div className="w-6 h-6 rounded-full border-2 border-zappy-200 border-t-zappy-600 animate-spin" />
  </div>
);

/** Boots a ZappyOne web app: session restore, store, router, i18n, toasts. */
export function mountApp({ App, store, roles = null, toastPosition = 'top-center' }) {
  function Root() {
    const [ready, setReady] = useState(() => readHint() === '0');
    useEffect(() => { restoreSession(store, roles).finally(() => { trackHint(store); setReady(true); }); }, []);
    if (!ready) return <Spinner />;
    return (
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToTop />
        <UpdateOnNavigate />
        <I18nProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <Toaster position={toastPosition} toastOptions={{ duration: 3500 }} />
        </I18nProvider>
      </BrowserRouter>
    );
  }

  // An open tab follows deploys instead of breaking on them (app/appUpdate).
  watchForUpdates();

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Provider store={store}>
        <Root />
      </Provider>
    </React.StrictMode>,
  );
}
