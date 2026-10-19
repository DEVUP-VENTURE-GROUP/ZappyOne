import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { fleetPath } from '../config/paths';

const FleetShell = lazy(() => import('./FleetShell'));
const LoginPage = lazy(() => import('@admin/app/LoginPage'));

const Spinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
  </div>
);

// Deliberately bland, as on the admin portal: nothing says what this origin hosts.
const NotFound = () => (
  <div className="flex min-h-screen items-center justify-center bg-white">
    <p className="text-sm text-slate-400">404, Not found</p>
  </div>
);

function RequireAdmin({ children }) {
  const { accessToken, role } = useSelector((s) => s.auth);
  const loc = useLocation();
  if (!accessToken || role !== 'admin') return <Navigate to={fleetPath('/login')} replace state={{ from: loc.pathname + loc.search }} />;
  return children;
}

/** The Fleet portal (fleet-ioc.zappyone.com): sign in, then the fleet. Admin accounts with Fleet access only. */
export default function FleetApp() {
  const { accessToken, role } = useSelector((s) => s.auth);
  const signedIn = !!accessToken && role === 'admin';
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path={fleetPath('/login')} element={signedIn ? <Navigate to={fleetPath('/dashboard')} replace /> : <LoginPage homePath={fleetPath('/dashboard')} title="Fleet" />} />
        <Route path={fleetPath('/dashboard')} element={<RequireAdmin><FleetShell /></RequireAdmin>} />
        <Route path={fleetPath('')} element={<Navigate to={fleetPath(signedIn ? '/dashboard' : '/login')} replace />} />
        <Route path="*" element={signedIn ? <Navigate to={fleetPath('/dashboard')} replace /> : <NotFound />} />
      </Routes>
    </Suspense>
  );
}
