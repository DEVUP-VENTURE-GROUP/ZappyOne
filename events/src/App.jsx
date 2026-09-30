import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useDisconnectOnLogout, useJobRealtime } from '@shared/hooks/useSocket';
import { RequireAuth } from '@shared/components/common/RequireAuth';
import ConnectionBanner from '@shared/components/common/ConnectionBanner';
import RouteProgress from '@shared/components/common/RouteProgress';
import ErrorBoundary from '@shared/components/common/ErrorBoundary';

const PartnerLoginPage = lazy(() => import('./pages/PartnerLoginPage'));
const PartnerDashboard = lazy(() => import('./pages/PartnerDashboard'));
const AdvertiserDashboard = lazy(() => import('./pages/AdvertiserDashboard'));

const LOGIN = '/partner/login';

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
  </div>
);

export default function App() {
  const { accessToken } = useSelector(selectAuth);
  useDisconnectOnLogout();
  // Booking changes land on the dashboard at once.
  useJobRealtime();
  const partner = (el) => <RequireAuth role="event_partner" loginPath={LOGIN}>{el}</RequireAuth>;

  return (
    <>
      <RouteProgress />
      <ConnectionBanner />
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path={LOGIN} element={accessToken ? <Navigate to="/partner" replace /> : <PartnerLoginPage />} />
            <Route path="/partner" element={partner(<PartnerDashboard />)} />
            <Route path="/partner/advertise" element={partner(<AdvertiserDashboard />)} />
            <Route path="*" element={<Navigate to={accessToken ? '/partner' : LOGIN} replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
