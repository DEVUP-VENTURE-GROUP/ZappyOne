import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useOutletContext, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useDisconnectOnLogout, useJobRealtime } from '@shared/hooks/useSocket';
import { RequireAuth } from '@shared/components/common/RequireAuth';
import ConnectionBanner from '@shared/components/common/ConnectionBanner';
import RouteProgress from '@shared/components/common/RouteProgress';
import ErrorBoundary from '@shared/components/common/ErrorBoundary';
import { Spinner } from './components/ui';
import AccountSetupGate from '@shared/components/account/AccountSetupGate';
import { VerifyEmailPage, ResetPasswordPage } from '@shared/components/account/AccountLinkPages';

/*
 * Each area of the partner portal is its own page and its own bundle, so a
 * change to one does not touch the others and a partner on a phone only
 * downloads the page they open.
 */
const PartnerLoginPage = lazy(() => import('./pages/PartnerLoginPage'));
const AdvertiserDashboard = lazy(() => import('./pages/AdvertiserDashboard'));
const PartnerShell = lazy(() => import('./features/shell/PartnerShell'));
const OverviewPage = lazy(() => import('./features/overview/OverviewPage'));
const BookingsPage = lazy(() => import('./features/bookings/BookingsPage'));
const BookingDetailPage = lazy(() => import('./features/bookings/BookingDetailPage'));
const PackagesPage = lazy(() => import('./features/packages/PackagesPage'));
const PackageEditorPage = lazy(() => import('./features/packages/PackageEditorPage'));
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage'));
const EarningsPage = lazy(() => import('./features/earnings/EarningsPage'));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage'));

const LOGIN = '/partner/login';

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-canvas">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-zappy-100 border-t-zappy-600" />
  </div>
);

/** Pages that need a verified partner send everyone else to verification. */
function VerifiedOnly() {
  const ctx = useOutletContext();
  if (!ctx?.partner) return <Spinner />;
  return ctx.verified ? <Outlet context={ctx} /> : <Navigate to="/partner/profile" replace />;
}

export default function App() {
  const { accessToken } = useSelector(selectAuth);
  useDisconnectOnLogout();
  // Booking changes land on the open page at once.
  useJobRealtime();
  const partner = (el) => <RequireAuth role="event_partner" loginPath={LOGIN}>{el}</RequireAuth>;

  return (
    <>
      <RouteProgress />
      <ConnectionBanner />
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <AccountSetupGate roles={['event_partner']} appName="ZappyOne Events">
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage homePath="/partner" />} />
            <Route path="/reset-password" element={<ResetPasswordPage loginPath={LOGIN} />} />
            <Route path={LOGIN} element={accessToken ? <Navigate to="/partner" replace /> : <PartnerLoginPage />} />
            <Route path="/partner/advertise" element={partner(<AdvertiserDashboard />)} />
            <Route path="/partner" element={partner(<PartnerShell />)}>
              <Route index element={<OverviewPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route element={<VerifiedOnly />}>
                <Route path="bookings" element={<BookingsPage />} />
                <Route path="bookings/:id" element={<BookingDetailPage />} />
                <Route path="packages" element={<PackagesPage />} />
                <Route path="packages/new" element={<PackageEditorPage />} />
                <Route path="packages/:id/edit" element={<PackageEditorPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="earnings" element={<EarningsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to={accessToken ? '/partner' : LOGIN} replace />} />
          </Routes>
          </AccountSetupGate>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
