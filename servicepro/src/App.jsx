import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useDisconnectOnLogout, useJobRealtime } from '@shared/hooks/useSocket';
import { RequireAuth } from '@shared/components/common/RequireAuth';
import ConnectionBanner from '@shared/components/common/ConnectionBanner';
import RouteProgress from '@shared/components/common/RouteProgress';
import ErrorBoundary from '@shared/components/common/ErrorBoundary';
import { providerRoutes } from '@shared/provider/providerRoutes';
import JobOfferHost from '@shared/components/jobs/JobOfferHost';
import ServiceProShell from './shell/ServiceProShell';
import ServiceProLogin, { HOME } from './auth/ServiceProLogin';
import AccountSetupGate from '@shared/components/account/AccountSetupGate';
import OnlineLocation from '@shared/provider/OnlineLocation';
import { VerifyEmailPage, ResetPasswordPage } from '@shared/components/account/AccountLinkPages';

const ShopDashboard = lazy(() => import('./workspaces/services/pages/ShopDashboard'));
const ShopProfilePage = lazy(() => import('./workspaces/services/pages/ShopProfilePage'));
const ShopKycPage = lazy(() => import('./workspaces/services/pages/ShopKycPage'));
const ShopWorkersPage = lazy(() => import('./workspaces/services/pages/ShopWorkersPage'));
const ShopOrdersPage = lazy(() => import('./workspaces/services/pages/ShopOrdersPage'));
const ShopInsightsPage = lazy(() => import('./workspaces/services/pages/ShopInsightsPage'));
const ShopEarningsPage = lazy(() => import('./workspaces/services/pages/ShopEarningsPage'));
const ShopPriceRequestsPage = lazy(() => import('./workspaces/services/pages/ShopPriceRequestsPage'));
const AppealsPage = lazy(() => import('@shared/provider/pages/WorkerAppealsPage'));
// Shared with workers: notifications and saved bank / UPI (the server keeps a shop's on the shop).
const NotificationsPage = lazy(() => import('@shared/provider/pages/WorkerNotificationsPage'));
const BankPage = lazy(() => import('@shared/provider/pages/WorkerBankPage'));
const ShopWithdrawPage = lazy(() => import('./workspaces/services/pages/ShopWithdrawPage'));
const ShopAccountPage = lazy(() => import('./workspaces/services/pages/ShopAccountPage'));
const ProviderReviewsPage = lazy(() => import('@shared/provider/pages/ProviderReviewsPage'));
const ShopWorkerHome = lazy(() => import('./workspaces/services/pages/ShopWorkerHome'));
const ShopPlansPage = lazy(() => import('./workspaces/services/pages/ShopPlansPage'));

// Event partners (decorators, planners) have their own workspace (workspaces/events).
const AdvertiserDashboard = lazy(() => import('./workspaces/events/pages/AdvertiserDashboard'));
const PartnerShell = lazy(() => import('./workspaces/events/features/shell/PartnerShell'));
const EventOverviewPage = lazy(() => import('./workspaces/events/features/overview/OverviewPage'));
const EventBookingsPage = lazy(() => import('./workspaces/events/features/bookings/BookingsPage'));
const EventBookingDetailPage = lazy(() => import('./workspaces/events/features/bookings/BookingDetailPage'));
const EventPackagesPage = lazy(() => import('./workspaces/events/features/packages/PackagesPage'));
const EventPackageEditorPage = lazy(() => import('./workspaces/events/features/packages/PackageEditorPage'));
const EventCalendarPage = lazy(() => import('./workspaces/events/features/calendar/CalendarPage'));
const EventEarningsPage = lazy(() => import('./workspaces/events/features/earnings/EarningsPage'));
const EventProfilePage = lazy(() => import('./workspaces/events/features/profile/ProfilePage'));

/** Event pages that need a verified partner send everyone else to verification. */
function EventVerifiedOnly() {
  const ctx = useOutletContext();
  if (!ctx?.partner) return null;
  return ctx.verified ? <Outlet context={ctx} /> : <Navigate to="/partner/profile" replace />;
}

// One sign-in for every partner (auth/ServiceProLogin); the old per-role addresses lead there.
const LOGIN = '/login';
const OLD_LOGINS = ['/shop/login', '/shop/worker/login', '/worker/login', '/partner/login'];

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="w-8 h-8 rounded-full border-2 border-zappy-200 border-t-zappy-600 animate-spin" />
  </div>
);

const homeFor = (role) => HOME[role] || LOGIN;

export default function App() {
  const { accessToken, role } = useSelector(selectAuth);
  useDisconnectOnLogout();
  // Job changes land on every open screen at once (new work rings via JobOfferHost).
  useJobRealtime();
  const shop = (el) => <RequireAuth role="shop" loginPath={LOGIN}>{el}</RequireAuth>;
  const eventPartner = (el) => <RequireAuth role="event_partner" loginPath={LOGIN}>{el}</RequireAuth>;

  return (
    <>
      <RouteProgress />
      <ConnectionBanner />
      {/* Rings for new work on any screen, for every kind this app works. */}
      {accessToken && ['worker', 'shop'].includes(role) && <JobOfferHost kinds={['repair', 'pet']} />}
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <OnlineLocation />
          <AccountSetupGate roles={['shop', 'worker', 'event_partner']} appName="ServicePro">
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage homePath={homeFor(role)} />} />
            <Route path="/reset-password" element={<ResetPasswordPage loginPath={LOGIN} />} />
            <Route path={LOGIN} element={accessToken ? <Navigate to={homeFor(role)} replace /> : <ServiceProLogin />} />
            {OLD_LOGINS.map((p) => <Route key={p} path={p} element={<Navigate to={LOGIN} replace />} />)}
            <Route path="/partner/advertise" element={eventPartner(<AdvertiserDashboard />)} />
            <Route path="/partner" element={eventPartner(<PartnerShell />)}>
              <Route index element={<EventOverviewPage />} />
              <Route path="profile" element={<EventProfilePage />} />
              <Route element={<EventVerifiedOnly />}>
                <Route path="bookings" element={<EventBookingsPage />} />
                <Route path="bookings/:id" element={<EventBookingDetailPage />} />
                <Route path="packages" element={<EventPackagesPage />} />
                <Route path="packages/new" element={<EventPackageEditorPage />} />
                <Route path="packages/:id/edit" element={<EventPackageEditorPage />} />
                <Route path="calendar" element={<EventCalendarPage />} />
                <Route path="earnings" element={<EventEarningsPage />} />
                <Route path="reviews" element={<ProviderReviewsPage embedded />} />
              </Route>
            </Route>
            {/* Every signed-in page sits in one frame: sidebar, or bottom bar + menu. */}
            <Route element={<ServiceProShell />}>
            <Route path="/shop" element={shop(<ShopDashboard />)} />
            <Route path="/shop/profile" element={shop(<ShopProfilePage />)} />
            <Route path="/shop/kyc" element={shop(<ShopKycPage />)} />
            <Route path="/shop/workers" element={shop(<ShopWorkersPage />)} />
            <Route path="/shop/orders" element={shop(<ShopOrdersPage />)} />
            <Route path="/shop/plans" element={shop(<ShopPlansPage />)} />
            <Route path="/shop/insights" element={shop(<ShopInsightsPage />)} />
            <Route path="/shop/earnings" element={shop(<ShopEarningsPage />)} />
            <Route path="/shop/price-requests" element={shop(<ShopPriceRequestsPage />)} />
            <Route path="/shop/appeals" element={shop(<AppealsPage />)} />
            <Route path="/shop/account" element={shop(<ShopAccountPage />)} />
            <Route path="/shop/notifications" element={shop(<NotificationsPage />)} />
            <Route path="/shop/bank" element={shop(<BankPage />)} />
            <Route path="/shop/withdraw" element={shop(<ShopWithdrawPage />)} />
            <Route path="/shop/reviews" element={shop(<ProviderReviewsPage back="/shop" />)} />
            {providerRoutes({
              loginPath: LOGIN,
              shopTeam: true,
              home: <ShopWorkerHome />,
              // Only the owner decides which services the shop offers.
              onboardRoles: ['shop'],
              onboardLoginPath: LOGIN,
            })}
            </Route>
            <Route path="*" element={<Navigate to={accessToken ? homeFor(role) : LOGIN} replace />} />
          </Routes>
          </AccountSetupGate>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
