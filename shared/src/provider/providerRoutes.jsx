import { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { STAFF_PORTAL } from './staffPortal';
import { RequireAuth } from '../components/common/RequireAuth';

const loaders = [];
const page = (load) => { loaders.push(load); return lazy(load); };
// Fetch every worker page once signed in, so moving between them never waits on a download.
export const prefetchWorkerPages = () => {
  const run = () => loaders.forEach((load) => load().catch(() => {}));
  if (typeof window !== 'undefined' && window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
};

const WorkerDashboard = page(() => import('./pages/WorkerDashboard'));
const WorkerKycPage = page(() => import('./pages/WorkerKycPage'));
const WorkerEditProfilePage = page(() => import('./pages/WorkerEditProfilePage'));
const WorkerNotificationsPage = page(() => import('./pages/WorkerNotificationsPage'));
const WorkerBankPage = page(() => import('./pages/WorkerBankPage'));
const WorkerWithdrawPage = page(() => import('./pages/WorkerWithdrawPage'));
const WorkerAppealsPage = page(() => import('./pages/WorkerAppealsPage'));
const MyDocumentsPage = page(() => import('./pages/MyDocumentsPage'));
const WorkerHoursPage = page(() => import('./pages/WorkerHoursPage'));
const StaffShiftsPage = page(() => import('./pages/StaffShiftsPage'));
const ProviderReviewsPage = page(() => import('./pages/ProviderReviewsPage'));
const WorkerEarningsPage = page(() => import('./pages/WorkerEarningsPage'));
const WorkerTrainingPage = page(() => import('./pages/WorkerTrainingPage'));
const WorkerGoalsPage = page(() => import('./pages/WorkerGoalsPage'));
const WorkerRepairJobPage = page(() => import('./pages/WorkerRepairJobPage'));
const WorkerPetJobPage = page(() => import('./pages/WorkerPetJobPage'));
const WorkBoardPage = page(() => import('./pages/WorkBoardPage'));
const WorkerHelpingJobPage = page(() => import('./pages/WorkerHelpingJobPage'));
const ProviderOnboardingPage = page(() => import('./pages/ProviderOnboardingPage'));
const ProviderRepairSetupPage = page(() => import('./pages/ProviderRepairSetupPage'));

/**
 * Worker screens shared by servicepro (shop workers) and Rakshak (independents).
 * Returned as <Route> elements, so each app drops them into its own <Routes>.
 *   loginPath    — where a signed-out worker is sent on this app
 *   helping      — errand/helping jobs are Rakshak-only
 *   onboardRoles — who may enrol in services on this app
 *   shopTeam     — a shop's technicians: the shop assigns work and pays them, so
 *                  wallet, payouts, goals, appeals and service sign-up are not theirs
 *   home         — the /worker screen for this app (defaults to the independent dashboard)
 *   onboardLoginPath — where a signed-out visitor to service sign-up is sent
 */
export function providerRoutes({ loginPath, helping = false, onboardRoles = ['worker'], shopTeam = false, home = null, onboardLoginPath = loginPath }) {
  const w = (el) => <RequireAuth role="worker" loginPath={loginPath}>{el}</RequireAuth>;
  // A job screen also serves the shop owner in a shop app: they accept, assign and collect.
  const job = (el) => <RequireAuth role={shopTeam ? ['worker', 'shop'] : 'worker'} loginPath={loginPath}>{el}</RequireAuth>;
  // One board for every kind of job this app works.
  const kinds = ['repair', 'pet', ...(helping ? ['helping'] : [])];
  const onboard = (el) => <RequireAuth role={onboardRoles} loginPath={onboardLoginPath}>{el}</RequireAuth>;
  const independentOnly = shopTeam ? [] : [
    <Route key="w-bank" path="/worker/bank" element={w(STAFF_PORTAL ? <Navigate to="/worker/shifts" replace /> : <WorkerBankPage />)} />,
    // Their week: when bookings for later may come to them (jobs/work-hours).
    <Route key="w-hours" path="/worker/hours" element={w(STAFF_PORTAL ? <Navigate to="/worker/shifts" replace /> : <WorkerHoursPage />)} />,
    // ZappyOne staff: shifts at their hub, salary, leave (server workforce/).
    <Route key="w-shifts" path="/worker/shifts" element={w(<StaffShiftsPage />)} />,
    <Route key="w-withdraw" path="/worker/withdraw" element={w(STAFF_PORTAL ? <Navigate to="/worker/shifts" replace /> : <WorkerWithdrawPage />)} />,
    <Route key="w-earnings" path="/worker/earnings" element={w(STAFF_PORTAL ? <Navigate to="/worker/shifts" replace /> : <WorkerEarningsPage />)} />,
    <Route key="w-training" path="/worker/training" element={w(<WorkerTrainingPage />)} />,
    <Route key="w-goals" path="/worker/goals" element={w(STAFF_PORTAL ? <Navigate to="/worker/shifts" replace /> : <WorkerGoalsPage />)} />,
  ];
  return [
    <Route key="w" path="/worker" element={w(home || <WorkerDashboard />)} />,
    <Route key="w-job" path="/worker/jobs/:id" element={<Navigate to="/worker/work" replace />} />,
    // Independents verify once, through their services (onboarding/identity.js); a shop's team keeps the ID check.
    <Route key="w-kyc" path="/worker/kyc" element={shopTeam ? w(<WorkerKycPage />) : <Navigate to="/provider/onboarding" replace />} />,
    <Route key="w-profile" path="/worker/profile" element={w(<WorkerEditProfilePage />)} />,
    // Every provider, a shop's team too: appeal a decision, and see what you uploaded.
    <Route key="w-appeals" path="/worker/appeals" element={w(STAFF_PORTAL ? <Navigate to="/worker/shifts" replace /> : <WorkerAppealsPage />)} />,
    <Route key="p-docs" path="/provider/documents" element={job(<MyDocumentsPage />)} />,
    <Route key="w-notif" path="/worker/notifications" element={w(<WorkerNotificationsPage />)} />,
    <Route key="w-reviews" path="/worker/reviews" element={w(<ProviderReviewsPage back="/worker" />)} />,
    ...independentOnly,
    <Route key="w-repair" path="/worker/repair/:id" element={job(<WorkerRepairJobPage />)} />,
    <Route key="w-work" path="/worker/work" element={w(<WorkBoardPage kinds={kinds} />)} />,
    <Route key="w-pet" path="/worker/pet" element={<Navigate to="/worker/work" replace />} />,
    <Route key="w-pet-job" path="/worker/pet/:id" element={job(<WorkerPetJobPage />)} />,
    ...(helping ? [
      <Route key="w-help" path="/worker/helping" element={<Navigate to="/worker/work" replace />} />,
      <Route key="w-help-job" path="/worker/helping/:id" element={w(<WorkerHelpingJobPage />)} />,
    ] : []),
    <Route key="p-onboard" path="/provider/onboarding" element={onboard(<ProviderOnboardingPage />)} />,
    <Route key="p-services" path="/provider/services" element={onboard(<ProviderRepairSetupPage />)} />,
    // Kept so existing links and notifications still resolve.
    <Route key="w-skills" path="/worker/skills" element={<Navigate to="/provider/onboarding" replace />} />,
    <Route key="w-setup" path="/worker/repair/setup" element={<Navigate to="/provider/services" replace />} />,
  ];
}
