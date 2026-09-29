import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { setAuth } from '../modules/auth/authSlice';
import { API_BASE } from '../services/apiBase';
import { I18nProvider } from '../i18n/I18nProvider';
import ErrorBoundary from '../components/common/ErrorBoundary';

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
    store.dispatch(setAuth({ accessToken: data.accessToken, profile: cached ?? { sub: claims?.sub }, role }));
  } catch { /* offline — stay signed out */ }
}

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="w-8 h-8 rounded-full border-2 border-zappy-200 border-t-zappy-600 animate-spin" />
  </div>
);

/** Boots a ZappyOne web app: session restore, store, router, i18n, toasts. */
export function mountApp({ App, store, roles = null, toastPosition = 'top-center' }) {
  function Root() {
    const [ready, setReady] = useState(false);
    useEffect(() => { restoreSession(store, roles).finally(() => setReady(true)); }, []);
    if (!ready) return <Spinner />;
    return (
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <I18nProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <Toaster position={toastPosition} toastOptions={{ duration: 3500 }} />
        </I18nProvider>
      </BrowserRouter>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Provider store={store}>
        <Root />
      </Provider>
    </React.StrictMode>,
  );
}
