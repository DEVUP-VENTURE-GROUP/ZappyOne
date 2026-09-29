import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { adminPath } from '../config/admin';

const AdminDashboard = lazy(() => import('./Shell'));
const AdminLoginPage = lazy(() => import('./LoginPage'));

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
  </div>
);

// Deliberately bland: nothing here says this origin hosts an admin console.
const NotFound = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <p className="text-sm text-slate-400">404 · Not found</p>
  </div>
);

// Only an admin token opens the console. A customer/worker token that somehow
// reached this origin is treated as signed out.
function RequireAdmin({ children }) {
  const { accessToken, role } = useSelector((s) => s.auth);
  const loc = useLocation();
  if (!accessToken || role !== 'admin') {
    return <Navigate to={adminPath('/login')} replace state={{ from: loc.pathname + loc.search }} />;
  }
  return children;
}

export default function App() {
  const { accessToken, role } = useSelector((s) => s.auth);
  const signedIn = !!accessToken && role === 'admin';
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path={adminPath('/login')} element={signedIn ? <Navigate to={adminPath('/dashboard')} replace /> : <AdminLoginPage />} />
        <Route path={adminPath('/dashboard')} element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path={adminPath('')} element={<Navigate to={adminPath(signedIn ? '/dashboard' : '/login')} replace />} />
        {/* Signed-in admins landing on / go to work; everyone else sees a 404. */}
        <Route path="*" element={signedIn ? <Navigate to={adminPath('/dashboard')} replace /> : <NotFound />} />
      </Routes>
    </Suspense>
  );
}
