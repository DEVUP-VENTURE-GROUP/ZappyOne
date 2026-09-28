import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useDisconnectOnLogout } from '@shared/hooks/useSocket';
import { RequireAuth } from '@shared/components/common/RequireAuth';
import ConnectionBanner from '@shared/components/common/ConnectionBanner';
import RouteProgress from '@shared/components/common/RouteProgress';
import ErrorBoundary from '@shared/components/common/ErrorBoundary';
import { providerRoutes } from '@shared/provider/providerRoutes';

const ShopLoginPage = lazy(() => import('./pages/ShopLoginPage'));
const ShopDashboard = lazy(() => import('./pages/ShopDashboard'));
const ShopProfilePage = lazy(() => import('./pages/ShopProfilePage'));
const ShopKycPage = lazy(() => import('./pages/ShopKycPage'));
const ShopWorkersPage = lazy(() => import('./pages/ShopWorkersPage'));
const ShopEarningsPage = lazy(() => import('./pages/ShopEarningsPage'));
const WorkerLoginPage = lazy(() => import('@shared/provider/pages/WorkerLoginPage'));

const SHOP_LOGIN = '/shop/login';
const WORKER_LOGIN = '/shop/worker/login';

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
  </div>
);

const homeFor = (role) => (role === 'worker' ? '/worker' : role === 'shop' ? '/shop' : SHOP_LOGIN);

export default function App() {
  const { accessToken, role } = useSelector(selectAuth);
  useDisconnectOnLogout();
  const shop = (el) => <RequireAuth role="shop" loginPath={SHOP_LOGIN}>{el}</RequireAuth>;

  return (
    <>
      <RouteProgress />
      <ConnectionBanner />
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path={SHOP_LOGIN} element={accessToken ? <Navigate to={homeFor(role)} replace /> : <ShopLoginPage />} />
            {/* Shop workers never self sign-up: only numbers the shop owner added get in. */}
            <Route
              path={WORKER_LOGIN}
              element={accessToken ? <Navigate to={homeFor(role)} replace />
                : <WorkerLoginPage allowSignup={false} portalLabel="ServicePro · Shop team" heading="Shop worker login" />}
            />
            <Route path="/shop" element={shop(<ShopDashboard />)} />
            <Route path="/shop/profile" element={shop(<ShopProfilePage />)} />
            <Route path="/shop/kyc" element={shop(<ShopKycPage />)} />
            <Route path="/shop/workers" element={shop(<ShopWorkersPage />)} />
            <Route path="/shop/earnings" element={shop(<ShopEarningsPage />)} />
            {providerRoutes({ loginPath: WORKER_LOGIN, onboardRoles: ['shop', 'worker'] })}
            <Route path="*" element={<Navigate to={accessToken ? homeFor(role) : SHOP_LOGIN} replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
