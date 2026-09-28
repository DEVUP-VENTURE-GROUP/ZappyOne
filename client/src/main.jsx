import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { store } from './store';
import { setAuth } from '@shared/modules/auth/authSlice';
import App from './App';
import { I18nProvider } from '@shared/i18n/I18nProvider';
import ErrorBoundary from '@shared/components/common/ErrorBoundary';
import '@shared/styles/index.css';

/**
 * Decode a JWT payload without verifying the signature.
 * Safe here because we only use the payload to restore UI state — the server
 * validates the token cryptographically on every protected API call.
 */
function jwtPayload(token) {
  try {
    const [, b64] = token.split('.');
    const json = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch { return null; }
}

/**
 * On page load / refresh the access token is gone (memory-only).
 * Hit /auth/refresh — the httpOnly RT cookie is sent automatically.
 * If it's valid we get a fresh access token and the session is restored silently.
 * If not (cookie expired/revoked/closed-browser) the user lands on the login page.
 *
 * Role is decoded from the access token itself so the session is fully restored
 * even after the browser is closed (sessionStorage is cleared but the RT cookie
 * survives for 30 days). (#78)
 */
async function restoreSession() {
  try {
    const apiBase = import.meta.env.VITE_API_URL || '';
    const res = await fetch(`${apiBase}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',            // sends the httpOnly RT cookie
      headers: { 'Content-Type': 'application/json' },
      body: '{}',                        // empty JSON body so Express parses req.body correctly
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.accessToken) {
      // Role from server response (primary) or JWT decode (fallback).
      // Both survive browser close — no dependency on sessionStorage.
      const claims  = jwtPayload(data.accessToken);
      const role    = data.role ?? claims?.role ?? null;
      // Admin sessions belong to the separate admin app, never this one.
      if (role === 'admin') return;

      // Merge with any cached profile (name/avatar) if still in sessionStorage
      const cached  = (() => {
        try { return JSON.parse(sessionStorage.getItem('zappy_profile_v2')); } catch { return null; }
      })();

      store.dispatch(setAuth({
        accessToken: data.accessToken,
        profile: cached ?? { sub: claims?.sub },
        role,
      }));
    }
  } catch { /* network error — remain logged out */ }
}

function Root() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    restoreSession().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <I18nProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster position="top-center" toastOptions={{ duration: 3500 }} />
      </I18nProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <Root />
    </Provider>
  </React.StrictMode>
);
