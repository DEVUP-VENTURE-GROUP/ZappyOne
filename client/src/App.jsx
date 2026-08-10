import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { selectAuth } from './modules/auth/authSlice';
import { useDisconnectOnLogout } from './hooks/useSocket';
import { useFCM } from './hooks/useFCM.jsx';
import useTelemetry from './hooks/useTelemetry';
import { prefetchMainTabs, onIdle } from './lib/routePrefetch';
import { prefetchServiceCatalog } from './hooks/useServiceCatalog';
import { loadCategories } from './hooks/useCategories';
import { adminPath } from './config/admin';
import { getSubdomainRedirect, isExternalRedirect } from './config/hosts';
import { RequireAuth } from './components/common/RequireAuth';
import NotificationBanner from './components/common/NotificationBanner';
import ConnectionBanner from './components/common/ConnectionBanner';
import RouteProgress from './components/common/RouteProgress';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/common/ErrorBoundary';

// ── Route-level code splitting ─────────────────────────────────────────────
// Each page is a separate chunk. Browsers only download the chunk for the
// route the user actually visits. Fixes #67 (memory) and #70 (slow browser).
//
// LoginPage is NOT lazy — it's the first screen most users see and needs to
// render immediately with no loading flash.
import LoginPage from './pages/LoginPage';
import WorkerLoginPage from './pages/WorkerLoginPage';

const HomePage            = lazy(() => import('./pages/HomePage'));
const BookingPage         = lazy(() => import('./pages/BookingPage'));
const OrderTrackingPage   = lazy(() => import('./pages/OrderTrackingPage'));
const OrdersListPage      = lazy(() => import('./pages/OrdersListPage'));
const TrackPage           = lazy(() => import('./pages/TrackPage'));
const ProfilePage         = lazy(() => import('./pages/ProfilePage'));
const NotificationsPage   = lazy(() => import('./pages/NotificationsPage'));
const ChatPage            = lazy(() => import('./pages/ChatPage'));
const ServicesPage        = lazy(() => import('./pages/ServicesPage'));
const CategoryCatalogPage = lazy(() => import('./pages/CategoryCatalogPage'));
const ServiceDetailPage   = lazy(() => import('./pages/ServiceDetailPage'));
const BrandSelectPage     = lazy(() => import('./pages/BrandSelectPage'));
const WorkerDashboard     = lazy(() => import('./pages/WorkerDashboard'));
const WorkerJobPage       = lazy(() => import('./pages/WorkerJobPage'));
const WorkerKycPage       = lazy(() => import('./pages/WorkerKycPage'));
const AdminDashboard      = lazy(() => import('./pages/AdminDashboard'));
const AdminLoginPage      = lazy(() => import('./pages/AdminLoginPage'));
const PlansPage           = lazy(() => import('./pages/PlansPage'));
const WalletPage          = lazy(() => import('./pages/WalletPage'));
const ReferralPage        = lazy(() => import('./pages/ReferralPage'));
const DisputesPage        = lazy(() => import('./pages/DisputesPage'));
const SupportPage         = lazy(() => import('./pages/SupportPage'));
const PaymentMethodsPage  = lazy(() => import('./pages/PaymentMethodsPage'));
const WorkerProfilePage     = lazy(() => import('./pages/WorkerProfilePage'));
const WorkerEditProfilePage        = lazy(() => import('./pages/WorkerEditProfilePage'));
const WorkerNotificationsPage      = lazy(() => import('./pages/WorkerNotificationsPage'));
const EventsHomePage               = lazy(() => import('./pages/events/EventsHomePage'));
const EventCategoryPage            = lazy(() => import('./pages/events/EventCategoryPage'));
const EventThemePage               = lazy(() => import('./pages/events/EventThemePage'));
const EventBookingPage             = lazy(() => import('./pages/events/EventBookingPage'));
const EventBookingListPage         = lazy(() => import('./pages/events/EventBookingListPage'));
const EventBookingDetailPage       = lazy(() => import('./pages/events/EventBookingDetailPage'));
const EventSavedThemesPage         = lazy(() => import('./pages/events/EventSavedThemesPage'));
const PartnerLoginPage             = lazy(() => import('./pages/events/PartnerLoginPage'));
const PartnerDashboard             = lazy(() => import('./pages/events/PartnerDashboard'));
const AdvertiserDashboard          = lazy(() => import('./pages/AdvertiserDashboard'));
const SpendingPage                 = lazy(() => import('./pages/SpendingPage'));
const NotificationPrefsPage        = lazy(() => import('./pages/NotificationPrefsPage'));
const PromosHubPage                = lazy(() => import('./pages/PromosHubPage'));
const ScheduledBookingsPage        = lazy(() => import('./pages/ScheduledBookingsPage'));
const AccountSecurityPage          = lazy(() => import('./pages/AccountSecurityPage'));
const WorkerBankPage               = lazy(() => import('./pages/WorkerBankPage'));
const WorkerWithdrawPage           = lazy(() => import('./pages/WorkerWithdrawPage'));
const WorkerAppealsPage            = lazy(() => import('./pages/WorkerAppealsPage'));
const WorkerEarningsPage           = lazy(() => import('./pages/WorkerEarningsPage'));
const WorkerSkillsPage             = lazy(() => import('./pages/WorkerSkillsPage'));
const WorkerTrainingPage           = lazy(() => import('./pages/WorkerTrainingPage'));
const WorkerGoalsPage              = lazy(() => import('./pages/WorkerGoalsPage'));
const FaqPage                      = lazy(() => import('./pages/FaqPage'));
const PolicyPage                   = lazy(() => import('./pages/PolicyPage'));
const RewardsPage                  = lazy(() => import('./pages/RewardsPage'));

// Minimal full-screen spinner shown while a lazy chunk loads.
// Keeps the shell visible so there's no blank white flash on slow connections.
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
    </div>
  );
}

export default function App() {
  useDisconnectOnLogout();
  useFCM();
  useTelemetry();
  const { accessToken: token, role } = useSelector(selectAuth);
  const location = useLocation();
  const subdomainRedirect = getSubdomainRedirect(
    typeof window !== 'undefined' ? window.location.hostname : '',
    location.pathname,
    token,
    role,
  );

  // A cross-host move (e.g. a worker landing on events.zappyone.com) can't be done
  // by the router — it needs a real navigation.
  useEffect(() => {
    if (subdomainRedirect && isExternalRedirect(subdomainRedirect)) {
      window.location.replace(subdomainRedirect);
    }
  }, [subdomainRedirect]);

  // Load the admin-managed category taxonomy once at startup so the customer
  // catalog, worker skill pickers and booking all reflect admin categories.
  useEffect(() => { loadCategories(); }, []);

  // Warm the main tab chunks once the browser is idle after first paint, so
  // tapping Home/Bookings/Track/Profile/Book is instant (no chunk-load spinner).
  useEffect(() => {
    if (!token) return;
    onIdle(() => {
      prefetchMainTabs();
      // The catalog response is shared by every catalog surface, so warming it
      // once here makes the first tap on a Home category tile render instantly.
      prefetchServiceCatalog();
    });
  }, [token]);

  return (
    <>
      {/* Top progress bar fires on every route change — "arriving fast" cue.
          Outside Suspense so it stays visible even while a chunk downloads. */}
      <RouteProgress />
      <ConnectionBanner />
      <Suspense fallback={<PageLoader />}>
      {/* Wrong host for this visitor → redirect INSTEAD of rendering. Rendering
          <Navigate> next to <Routes> mounted the wrong page for a frame first,
          firing its data fetches (and its RequireAuth bounce) before moving on.
          An external target shows the loader while the full page load runs. */}
      {subdomainRedirect ? (
        isExternalRedirect(subdomainRedirect)
          ? <PageLoader />
          : <Navigate to={subdomainRedirect} replace />
      ) : (
      <>
      {/* Show notification permission banner for logged-in users with non-admin roles */}
      {token && role !== 'admin' && <NotificationBanner />}
      {/* Route-level boundary — a crash in one page shows the recovery screen but
          auto-resets when the user navigates elsewhere (keyed by path). */}
      <ErrorBoundary key={location.pathname}>
      <Routes location={location} key={location.pathname}>
        {/* Public */}
        {/* Public help content — FAQs + policy pages (admin-managed) */}
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/policy/:slug" element={<PolicyPage />} />

        <Route path="/login" element={token ? <RedirectByRole role={role} /> : <LoginPage />} />
        <Route
          path="/worker/login"
          element={token ? <RedirectByRole role={role} /> : <WorkerLoginPage />}
        />
        <Route
          path={adminPath('/login')}
          element={token ? <RedirectByRole role={role} /> : <AdminLoginPage />}
        />

        {/* User app */}
        <Route element={<MainLayout />}>
          <Route path="/"       element={<HomeOrRedirect role={role} token={token} />} />
          <Route path="/home"   element={<HomeOrRedirect role={role} token={token} />} />
          <Route path="/services" element={<RequireAuth role="user"><ServicesPage /></RequireAuth>} />
          {/* One catalog experience per vertical — Car Services, Phone Repair,
              Plumbing… all render from ServiceCatalogView via category config. */}
          <Route path="/services/:category" element={<RequireAuth role="user"><CategoryCatalogPage /></RequireAuth>} />
          <Route path="/orders" element={<RequireAuth role="user"><OrdersListPage /></RequireAuth>} />
          <Route path="/track"  element={<RequireAuth role="user"><TrackPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth role="user"><ProfilePage /></RequireAuth>} />
          <Route path="/disputes" element={<RequireAuth role="user"><DisputesPage /></RequireAuth>} />
          <Route path="/support" element={<RequireAuth role="user"><SupportPage /></RequireAuth>} />
          <Route path="/payments" element={<RequireAuth role="user"><PaymentMethodsPage /></RequireAuth>} />
          <Route path="/wallet" element={<RequireAuth><WalletPage /></RequireAuth>} />
        </Route>

        {/* Routes outside MainLayout (no bottom nav) */}
        {/* Detail sits outside MainLayout: it owns a sticky Book Now bar, so the
            bottom nav would double up on the same screen edge. */}
        <Route path="/service/:code" element={<RequireAuth role="user"><ServiceDetailPage /></RequireAuth>} />
        {/* Brand/model step for verticals with a Brand catalog (phone, laptop,
            car, bike). Redirects straight to /book when there's nothing to pick. */}
        <Route path="/service/:code/brand" element={<RequireAuth role="user"><BrandSelectPage /></RequireAuth>} />
        <Route path="/book/:service" element={<RequireAuth role="user"><BookingPage /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth role="user"><OrderTrackingPage /></RequireAuth>} />
        <Route path="/orders/:id/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth role="user"><NotificationsPage /></RequireAuth>} />
        <Route path="/referral" element={<RequireAuth role="user"><ReferralPage /></RequireAuth>} />
        <Route path="/spending" element={<RequireAuth role="user"><SpendingPage /></RequireAuth>} />
        <Route path="/notification-prefs" element={<RequireAuth role="user"><NotificationPrefsPage /></RequireAuth>} />
        <Route path="/promos" element={<RequireAuth role="user"><PromosHubPage /></RequireAuth>} />
        <Route path="/scheduled" element={<RequireAuth role="user"><ScheduledBookingsPage /></RequireAuth>} />
        <Route path="/rewards" element={<RequireAuth role="user"><RewardsPage /></RequireAuth>} />
        <Route path="/account-security" element={<RequireAuth role="user"><AccountSecurityPage /></RequireAuth>} />
        <Route path="/worker-profile/:workerId" element={<RequireAuth role="user"><WorkerProfilePage /></RequireAuth>} />

        {/* Plans — available to both users and workers */}
        <Route path="/plans"  element={<RequireAuth><PlansPage /></RequireAuth>} />

        {/* Worker app */}
        <Route path="/worker" element={<RequireAuth role="worker"><WorkerDashboard /></RequireAuth>} />
        <Route path="/worker/jobs/:id" element={<RequireAuth role="worker"><WorkerJobPage /></RequireAuth>} />
        <Route path="/worker/kyc" element={<RequireAuth role="worker"><WorkerKycPage /></RequireAuth>} />
        <Route path="/worker/profile" element={<RequireAuth role="worker"><WorkerEditProfilePage /></RequireAuth>} />
        <Route path="/worker/notifications" element={<RequireAuth role="worker"><WorkerNotificationsPage /></RequireAuth>} />
        <Route path="/worker/bank" element={<RequireAuth role="worker"><WorkerBankPage /></RequireAuth>} />
        <Route path="/worker/withdraw" element={<RequireAuth role="worker"><WorkerWithdrawPage /></RequireAuth>} />
        <Route path="/worker/appeals" element={<RequireAuth role="worker"><WorkerAppealsPage /></RequireAuth>} />
        <Route path="/worker/earnings" element={<RequireAuth role="worker"><WorkerEarningsPage /></RequireAuth>} />
        <Route path="/worker/skills" element={<RequireAuth role="worker"><WorkerSkillsPage /></RequireAuth>} />
        <Route path="/worker/training" element={<RequireAuth role="worker"><WorkerTrainingPage /></RequireAuth>} />
        <Route path="/worker/goals" element={<RequireAuth role="worker"><WorkerGoalsPage /></RequireAuth>} />

        {/* Event Partner */}
        <Route path="/partner/login" element={token ? <RedirectByRole role={role} /> : <PartnerLoginPage />} />
        <Route path="/partner" element={<RequireAuth role="event_partner"><PartnerDashboard /></RequireAuth>} />
        <Route path="/partner/advertise" element={<RequireAuth role="event_partner"><AdvertiserDashboard /></RequireAuth>} />

        {/* Event Commerce */}
        <Route path="/events"                    element={<RequireAuth role="user"><EventsHomePage /></RequireAuth>} />
        <Route path="/events/browse"             element={<RequireAuth role="user"><EventCategoryPage /></RequireAuth>} />
        <Route path="/events/themes/:id"         element={<RequireAuth role="user"><EventThemePage /></RequireAuth>} />
        <Route path="/events/book/:id"           element={<RequireAuth role="user"><EventBookingPage /></RequireAuth>} />
        <Route path="/events/bookings"           element={<RequireAuth role="user"><EventBookingListPage /></RequireAuth>} />
        <Route path="/events/bookings/:id"       element={<RequireAuth role="user"><EventBookingDetailPage /></RequireAuth>} />
        <Route path="/events/saved"              element={<RequireAuth role="user"><EventSavedThemesPage /></RequireAuth>} />

        {/* Admin */}
        <Route
          path={adminPath('/dashboard')}
          element={<RequireAuth role="admin"><AdminDashboard /></RequireAuth>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
      </>
      )}
    </Suspense>
    </>
  );
}

function RedirectByRole({ role }) {
  const dest = role === 'worker' ? '/worker'
    : role === 'admin' ? adminPath('/dashboard')
    : role === 'event_partner' ? '/partner'
    : '/';
  return <Navigate to={dest} replace />;
}

// Home is public — but logged-in workers/admins/partners still get redirected to their dashboard.
function HomeOrRedirect({ role, token }) {
  if (token && role && role !== 'user') return <RedirectByRole role={role} />;
  return <HomePage />;
}
