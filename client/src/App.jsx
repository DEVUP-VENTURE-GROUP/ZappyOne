import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useDisconnectOnLogout, useJobRealtime } from '@shared/hooks/useSocket';
import { useFCM } from './hooks/useFCM.jsx';
import useTelemetry from './hooks/useTelemetry';
import { prefetchMainTabs, onIdle } from './lib/routePrefetch';
import { prefetchServiceCatalog } from './hooks/useServiceCatalog';
import { loadCategories } from './hooks/useCategories';
import { PORTAL_URLS } from '@shared/config/portals';
import { RequireAuth } from '@shared/components/common/RequireAuth';
import NotificationBanner from './components/common/NotificationBanner';
import ConnectionBanner from '@shared/components/common/ConnectionBanner';
import RouteProgress from '@shared/components/common/RouteProgress';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from '@shared/components/common/ErrorBoundary';

// Route-level code splitting
// Each page is a separate chunk. Browsers only download the chunk for the
// route the user actually visits. Fixes #67 (memory) and #70 (slow browser).
//
// LoginPage is NOT lazy — it's the first screen most users see and needs to
// render immediately with no loading flash.
import LoginPage from './pages/LoginPage';

const HomePage            = lazy(() => import('./pages/HomePage'));
const OrderTrackingPage   = lazy(() => import('./pages/OrderTrackingPage'));
const OrdersListPage      = lazy(() => import('./pages/OrdersListPage'));
const TrackPage           = lazy(() => import('./pages/TrackPage'));
const ProfilePage         = lazy(() => import('./pages/ProfilePage'));
const NotificationsPage   = lazy(() => import('./pages/NotificationsPage'));
const ChatPage            = lazy(() => import('./pages/ChatPage'));
// The all-services catalog is now the LIVE catalog — see AllServicesPage.
const AllServicesPage     = lazy(() => import('./pages/AllServicesPage'));
const PlansPage           = lazy(() => import('./pages/PlansPage'));
const WalletPage          = lazy(() => import('./pages/WalletPage'));
const ReferralPage        = lazy(() => import('./pages/ReferralPage'));
const DisputesPage        = lazy(() => import('./pages/DisputesPage'));
const SupportPage         = lazy(() => import('./pages/SupportPage'));
const PaymentMethodsPage  = lazy(() => import('./pages/PaymentMethodsPage'));
const WorkerProfilePage     = lazy(() => import('./pages/WorkerProfilePage'));
const EventsHomePage               = lazy(() => import('./pages/events/EventsHomePage'));
const EventCategoryPage            = lazy(() => import('./pages/events/EventCategoryPage'));
const EventThemePage               = lazy(() => import('./pages/events/EventThemePage'));
const EventBookingPage             = lazy(() => import('./pages/events/EventBookingPage'));
const EventBookingListPage         = lazy(() => import('./pages/events/EventBookingListPage'));
const EventBookingDetailPage       = lazy(() => import('./pages/events/EventBookingDetailPage'));
const EventSavedThemesPage         = lazy(() => import('./pages/events/EventSavedThemesPage'));
const NearbyShopsPage              = lazy(() => import('./pages/NearbyShopsPage'));
const RepairFlowPage               = lazy(() => import('./pages/repair/RepairFlowPage'));
const CategoryProblemsPage         = lazy(() => import('./pages/repair/CategoryProblemsPage'));
const LegacyServiceRedirect        = lazy(() => import('./pages/LegacyServiceRedirect'));
const RepairBookingPage            = lazy(() => import('./pages/repair/RepairBookingPage'));
const MyAssetsPage                  = lazy(() => import('./pages/repair/MyAssetsPage'));
const HelpingServicesPage           = lazy(() => import('./pages/helping/HelpingServicesPage'));
const ShoppingTaskPage              = lazy(() => import('./pages/helping/ShoppingTaskPage'));
const ReturnTaskPage                = lazy(() => import('./pages/helping/ReturnTaskPage'));
const HelpingTaskDetailPage         = lazy(() => import('./pages/helping/HelpingTaskDetailPage'));
const PetServicesPage               = lazy(() => import('./pages/pet/PetServicesPage'));
const MyPetsPage                    = lazy(() => import('./pages/pet/MyPetsPage'));
const PetDetailPage                 = lazy(() => import('./pages/pet/PetDetailPage'));
const PetBookingFlowPage            = lazy(() => import('./pages/pet/PetBookingFlowPage'));
const PetBookingDetailPage          = lazy(() => import('./pages/pet/PetBookingDetailPage'));
const PetRecurringPage              = lazy(() => import('./pages/pet/PetRecurringPage'));
const ShopPublicProfilePage        = lazy(() => import('./pages/ShopPublicProfilePage'));
const SpendingPage                 = lazy(() => import('./pages/SpendingPage'));
const NotificationPrefsPage        = lazy(() => import('./pages/NotificationPrefsPage'));
const PromosHubPage                = lazy(() => import('./pages/PromosHubPage'));
const ScheduledBookingsPage        = lazy(() => import('./pages/ScheduledBookingsPage'));
const AccountSecurityPage          = lazy(() => import('./pages/AccountSecurityPage'));
const FaqPage                      = lazy(() => import('./pages/FaqPage'));
const PolicyPage                   = lazy(() => import('./pages/PolicyPage'));
const RewardsPage                  = lazy(() => import('./pages/RewardsPage'));

// Minimal full-screen spinner shown while a lazy chunk loads.
// Keeps the shell visible so there's no blank white flash on slow connections.
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 rounded-full border-2 border-zappy-200 border-t-zappy-600 animate-spin" />
    </div>
  );
}

export default function App() {
  useDisconnectOnLogout();
  // Job changes land on every open screen at once.
  useJobRealtime();
  useFCM();
  useTelemetry();
  const { accessToken: token, role } = useSelector(selectAuth);
  const location = useLocation();

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
      {/* Show notification permission banner for logged-in users with non-admin roles */}
      {token && <NotificationBanner />}
      {/* Route-level boundary — a crash in one page shows the recovery screen but
          auto-resets when the user navigates elsewhere (keyed by path). */}
      <ErrorBoundary key={location.pathname}>
      <Routes location={location} key={location.pathname}>
        {/* Public */}
        {/* Public help content — FAQs + policy pages (admin-managed) */}
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/policy/:slug" element={<PolicyPage />} />

        <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />

        {/* User app */}
        <Route element={<MainLayout />}>
          <Route path="/"       element={<HomePage />} />
          <Route path="/home"   element={<HomePage />} />
          <Route path="/services" element={<RequireAuth role="user"><AllServicesPage /></RequireAuth>} />
          {/*
            Per-vertical catalog pages are retired: a customer reaching one now
            lands on the live list instead of a category whose booking flow is
            being rebuilt. Old links keep working rather than 404ing.
          */}
          <Route path="/services/:category" element={<Navigate to="/services" replace />} />
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
        {/* Old booking links open the live flow for that service (see LegacyServiceRedirect). */}
        <Route path="/service/:code" element={<LegacyServiceRedirect />} />
        {/* Brand/model step for verticals with a Brand catalog (phone, laptop,
            car, bike). Redirects straight to /book when there's nothing to pick. */}
        <Route path="/service/:code/brand" element={<LegacyServiceRedirect />} />
        <Route path="/book/:service" element={<LegacyServiceRedirect />} />
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


        {/* Providers moved to their own apps; keep old bookmarks working. */}
        <Route path="/shop/*" element={<ExternalRedirect base={PORTAL_URLS.servicepro} />} />
        <Route path="/worker/*" element={<ExternalRedirect base={PORTAL_URLS.rakshak} />} />
        <Route path="/provider/*" element={<ExternalRedirect base={PORTAL_URLS.rakshak} />} />
        <Route path="/partner/*" element={<ExternalRedirect base={PORTAL_URLS.events} />} />

        {/* Provider onboarding — one path for shops and independent technicians */}

        {/* Repair verticals — one flow component, the vertical is data */}
        <Route path="/repair" element={<RequireAuth role="user"><RepairFlowPage vertical="mobile" /></RequireAuth>} />
        <Route path="/repair/laptop" element={<RequireAuth role="user"><RepairFlowPage vertical="laptop" /></RequireAuth>} />
        {/* Hyphenated in the URL, underscored in the data — the vertical code is
            two_wheeler everywhere behind this line. */}
        <Route path="/repair/two-wheeler" element={<RequireAuth role="user"><RepairFlowPage vertical="two_wheeler" /></RequireAuth>} />
        <Route path="/repair/four-wheeler" element={<RequireAuth role="user"><RepairFlowPage vertical="four_wheeler" /></RequireAuth>} />
        <Route path="/repair/water-tank-care" element={<RequireAuth role="user"><RepairFlowPage vertical="water_tank_care" /></RequireAuth>} />
        <Route path="/my-assets" element={<RequireAuth role="user"><MyAssetsPage /></RequireAuth>} />
        <Route path="/helping" element={<RequireAuth role="user"><HelpingServicesPage /></RequireAuth>} />
        <Route path="/helping/shopping" element={<RequireAuth role="user"><ShoppingTaskPage /></RequireAuth>} />
        <Route path="/helping/returns" element={<RequireAuth role="user"><ReturnTaskPage /></RequireAuth>} />
        <Route path="/helping/tasks/:id" element={<RequireAuth role="user"><HelpingTaskDetailPage /></RequireAuth>} />
        <Route path="/pet" element={<RequireAuth role="user"><PetServicesPage /></RequireAuth>} />
        <Route path="/pet/my-pets" element={<RequireAuth role="user"><MyPetsPage /></RequireAuth>} />
        <Route path="/pet/my-pets/:id" element={<RequireAuth role="user"><PetDetailPage /></RequireAuth>} />
        <Route path="/pet/book/:categoryCode" element={<RequireAuth role="user"><PetBookingFlowPage /></RequireAuth>} />
        {/* Pet bookings live in My bookings with every other kind (useMyJobs). */}
        <Route path="/pet/bookings" element={<Navigate to="/orders" replace />} />
        <Route path="/pet/bookings/:id" element={<RequireAuth role="user"><PetBookingDetailPage /></RequireAuth>} />
        <Route path="/pet/recurring" element={<RequireAuth role="user"><PetRecurringPage /></RequireAuth>} />
        {/* One heading — Display, Storage, Connectivity — and everything under it. */}
        <Route
          path="/repair/category/:vertical/:categoryCode"
          element={<RequireAuth role="user"><CategoryProblemsPage /></RequireAuth>}
        />
        <Route path="/repair/bookings/:id" element={<RequireAuth role="user"><RepairBookingPage /></RequireAuth>} />
        {/* Kept so existing worker links and notifications still resolve. */}

        {/* Nearby Shops — customer-facing discovery */}
        <Route path="/nearby-shops" element={<RequireAuth role="user"><NearbyShopsPage /></RequireAuth>} />
        <Route path="/shops/:id" element={<RequireAuth role="user"><ShopPublicProfilePage /></RequireAuth>} />

        {/* Event Commerce */}
        <Route path="/events"                    element={<RequireAuth role="user"><EventsHomePage /></RequireAuth>} />
        <Route path="/events/browse"             element={<RequireAuth role="user"><EventCategoryPage /></RequireAuth>} />
        <Route path="/events/themes/:id"         element={<RequireAuth role="user"><EventThemePage /></RequireAuth>} />
        <Route path="/events/book/:id"           element={<RequireAuth role="user"><EventBookingPage /></RequireAuth>} />
        <Route path="/events/bookings"           element={<RequireAuth role="user"><EventBookingListPage /></RequireAuth>} />
        <Route path="/events/bookings/:id"       element={<RequireAuth role="user"><EventBookingDetailPage /></RequireAuth>} />
        <Route path="/events/saved"              element={<RequireAuth role="user"><EventSavedThemesPage /></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </Suspense>
    </>
  );
}

function ExternalRedirect({ base }) {
  useEffect(() => { window.location.replace(base + window.location.pathname + window.location.search); }, [base]);
  return <PageLoader />;
}

