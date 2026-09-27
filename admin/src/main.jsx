import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { store } from './store';
import { setAuth } from '@client/modules/auth/authSlice';
import { API_BASE } from '@client/services/apiBase';
import ErrorBoundary from '@client/components/common/ErrorBoundary';
import App from './App';
import '@client/styles/index.css';

function jwtRole(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)).role ?? null;
  } catch { return null; }
}

/**
 * The access token lives in memory only, so a reload starts signed out.
 * The admin refresh token is an httpOnly cookie of its own (separate from the
 * customer app's), which /auth/refresh reads when the request says it comes
 * from the admin portal. Anything but an admin session is ignored.
 */
async function restoreSession() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'admin' },
      body: '{}',
    });
    if (!res.ok) return;
    const data = await res.json();
    const role = data.role ?? jwtRole(data.accessToken);
    if (data.accessToken && role === 'admin') {
      let profile = null;
      try { profile = JSON.parse(sessionStorage.getItem('zappy_profile_v2')); } catch { /* none cached */ }
      store.dispatch(setAuth({ accessToken: data.accessToken, profile, role }));
    }
  } catch { /* offline — stay signed out */ }
}

function Root() {
  const [ready, setReady] = useState(false);
  useEffect(() => { restoreSession().finally(() => setReady(true)); }, []);
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
      </div>
    );
  }
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
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
