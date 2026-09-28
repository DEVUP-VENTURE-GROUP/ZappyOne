import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useDisconnectOnLogout } from '@shared/hooks/useSocket';
import ConnectionBanner from '@shared/components/common/ConnectionBanner';
import RouteProgress from '@shared/components/common/RouteProgress';
import ErrorBoundary from '@shared/components/common/ErrorBoundary';
import { providerRoutes } from '@shared/provider/providerRoutes';

const WorkerLoginPage = lazy(() => import('@shared/provider/pages/WorkerLoginPage'));

const LOGIN = '/login';

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
  </div>
);

export default function App() {
  const { accessToken } = useSelector(selectAuth);
  useDisconnectOnLogout();

  return (
    <>
      <RouteProgress />
      <ConnectionBanner />
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Anyone may sign up; what they can work on is decided per service by verification. */}
            <Route path={LOGIN} element={accessToken ? <Navigate to="/worker" replace /> : <WorkerLoginPage portalLabel="Rakshak" />} />
            <Route path="/worker/login" element={<Navigate to={LOGIN} replace />} />
            {providerRoutes({ loginPath: LOGIN, helping: true })}
            <Route path="*" element={<Navigate to={accessToken ? '/worker' : LOGIN} replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
