import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useDisconnectOnLogout, useJobRealtime } from '@shared/hooks/useSocket';
import { RequireAuth } from '@shared/components/common/RequireAuth';
import ConnectionBanner from '@shared/components/common/ConnectionBanner';
import RouteProgress from '@shared/components/common/RouteProgress';
import ErrorBoundary from '@shared/components/common/ErrorBoundary';
import { providerRoutes } from '@shared/provider/providerRoutes';
import JobOfferHost from '@shared/components/jobs/JobOfferHost';
import LoginRoleSwitch from './components/LoginRoleSwitch';
import ServiceProShell from './components/ServiceProShell';
import AccountSetupGate from '@shared/components/account/AccountSetupGate';
import OnlineLocation from '@shared/provider/OnlineLocation';
import { VerifyEmailPage, ResetPasswordPage } from '@shared/components/account/AccountLinkPages';

const ShopLoginPage = lazy(() => import('./pages/ShopLoginPage'));
const ShopDashboard = lazy(() => import('./pages/ShopDashboard'));
const ShopProfilePage = lazy(() => import('./pages/ShopProfilePage'));
const ShopKycPage = lazy(() => import('./pages/ShopKycPage'));
const ShopWorkersPage = lazy(() => import('./pages/ShopWorkersPage'));
const ShopOrdersPage = lazy(() => import('./pages/ShopOrdersPage'));
const ShopInsightsPage = lazy(() => import('./pages/ShopInsightsPage'));
const ShopEarningsPage = lazy(() => import('./pages/ShopEarningsPage'));
const ShopPriceRequestsPage = lazy(() => import('./pages/ShopPriceRequestsPage'));
const AppealsPage = lazy(() => import('@shared/provider/pages/WorkerAppealsPage'));
// Shared with workers: notifications and saved bank / UPI (the server keeps a shop's on the shop).
const NotificationsPage = lazy(() => import('@shared/provider/pages/WorkerNotificationsPage'));
const BankPage = lazy(() => import('@shared/provider/pages/WorkerBankPage'));
const ShopWithdrawPage = lazy(() => import('./pages/ShopWithdrawPage'));
const ShopAccountPage = lazy(() => import('./pages/ShopAccountPage'));
const ProviderReviewsPage = lazy(() => import('@shared/provider/pages/ProviderReviewsPage'));
const WorkerLoginPage = lazy(() => import('@shared/provider/pages/WorkerLoginPage'));
const ShopWorkerHome = lazy(() => import('./pages/ShopWorkerHome'));

const SHOP_LOGIN = '/shop/login';
const WORKER_LOGIN = '/shop/worker/login';

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="w-8 h-8 rounded-full border-2 border-zappy-200 border-t-zappy-600 animate-spin" />
  </div>
);

const homeFor = (role) => (role === 'worker' ? '/worker' : role === 'shop' ? '/shop' : SHOP_LOGIN);

export default function App() {
  const { accessToken, role } = useSelector(selectAuth);
  useDisconnectOnLogout();
  // Job changes land on every open screen at once (new work rings via JobOfferHost).
  useJobRealtime();
  const shop = (el) => <RequireAuth role="shop" loginPath={SHOP_LOGIN}>{el}</RequireAuth>;

  return (
    <>
      <RouteProgress />
      <ConnectionBanner />
      {/* Rings for new work on any screen, for every kind this app works. */}
      {accessToken && ['worker', 'shop'].includes(role) && <JobOfferHost kinds={['repair', 'pet']} />}
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <OnlineLocation />
          <AccountSetupGate roles={['shop', 'worker']} appName="ServicePro">
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage homePath={homeFor(role)} />} />
            <Route path="/reset-password" element={<ResetPasswordPage loginPath={role === 'worker' ? WORKER_LOGIN : SHOP_LOGIN} />} />
            <Route path={SHOP_LOGIN} element={accessToken ? <Navigate to={homeFor(role)} replace /> : <ShopLoginPage />} />
            {/* Shop workers never self sign-up: only numbers the shop owner added get in. */}
            <Route
              path={WORKER_LOGIN}
              element={accessToken ? <Navigate to={homeFor(role)} replace />
                : <WorkerLoginPage allowSignup={false} portalLabel="ServicePro, Shop team" heading="Shop worker login" footer={<LoginRoleSwitch active="worker" />} />}
            />
            <Route path="/worker/login" element={<Navigate to={WORKER_LOGIN} replace />} />
            {/* Every signed-in page sits in one frame: sidebar, or bottom bar + menu. */}
            <Route element={<ServiceProShell />}>
            <Route path="/shop" element={shop(<ShopDashboard />)} />
            <Route path="/shop/profile" element={shop(<ShopProfilePage />)} />
            <Route path="/shop/kyc" element={shop(<ShopKycPage />)} />
            <Route path="/shop/workers" element={shop(<ShopWorkersPage />)} />
            <Route path="/shop/orders" element={shop(<ShopOrdersPage />)} />
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
              loginPath: WORKER_LOGIN,
              shopTeam: true,
              home: <ShopWorkerHome />,
              // Only the owner decides which services the shop offers.
              onboardRoles: ['shop'],
              onboardLoginPath: SHOP_LOGIN,
            })}
            </Route>
            <Route path="*" element={<Navigate to={accessToken ? homeFor(role) : SHOP_LOGIN} replace />} />
          </Routes>
          </AccountSetupGate>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
