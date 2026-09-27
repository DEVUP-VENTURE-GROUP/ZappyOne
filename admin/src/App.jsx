import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

const AdminDashboard = lazy(() => import('./AdminDashboard'));
const AdminLoginPage = lazy(() => import('./AdminLoginPage'));

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
  </div>
);

// Only an admin token opens the console. A customer/worker token that somehow
// reached this origin is treated as signed out.
function RequireAdmin({ children }) {
  const { accessToken, role } = useSelector((s) => s.auth);
  const loc = useLocation();
  if (!accessToken || role !== 'admin') {
    return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  }
  return children;
}

export default function App() {
  const { accessToken, role } = useSelector((s) => s.auth);
  const signedIn = !!accessToken && role === 'admin';
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={signedIn ? <Navigate to="/dashboard" replace /> : <AdminLoginPage />} />
        <Route path="/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="*" element={<Navigate to={signedIn ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </Suspense>
  );
}
