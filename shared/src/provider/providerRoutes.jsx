import { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { RequireAuth } from '../components/common/RequireAuth';

const WorkerDashboard = lazy(() => import('./pages/WorkerDashboard'));
const WorkerJobPage = lazy(() => import('./pages/WorkerJobPage'));
const WorkerKycPage = lazy(() => import('./pages/WorkerKycPage'));
const WorkerEditProfilePage = lazy(() => import('./pages/WorkerEditProfilePage'));
const WorkerNotificationsPage = lazy(() => import('./pages/WorkerNotificationsPage'));
const WorkerBankPage = lazy(() => import('./pages/WorkerBankPage'));
const WorkerWithdrawPage = lazy(() => import('./pages/WorkerWithdrawPage'));
const WorkerAppealsPage = lazy(() => import('./pages/WorkerAppealsPage'));
const WorkerEarningsPage = lazy(() => import('./pages/WorkerEarningsPage'));
const WorkerTrainingPage = lazy(() => import('./pages/WorkerTrainingPage'));
const WorkerGoalsPage = lazy(() => import('./pages/WorkerGoalsPage'));
const WorkerRepairJobPage = lazy(() => import('./pages/WorkerRepairJobPage'));
const WorkerPetJobPage = lazy(() => import('./pages/WorkerPetJobPage'));
const WorkBoardPage = lazy(() => import('./pages/WorkBoardPage'));
const WorkerHelpingJobPage = lazy(() => import('./pages/WorkerHelpingJobPage'));
const ProviderOnboardingPage = lazy(() => import('./pages/ProviderOnboardingPage'));
const ProviderRepairSetupPage = lazy(() => import('./pages/ProviderRepairSetupPage'));

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
  // One board for every kind of job this app works.
  const kinds = ['repair', 'pet', ...(helping ? ['helping'] : [])];
  const onboard = (el) => <RequireAuth role={onboardRoles} loginPath={onboardLoginPath}>{el}</RequireAuth>;
  const independentOnly = shopTeam ? [] : [
    <Route key="w-bank" path="/worker/bank" element={w(<WorkerBankPage />)} />,
    <Route key="w-withdraw" path="/worker/withdraw" element={w(<WorkerWithdrawPage />)} />,
    <Route key="w-appeals" path="/worker/appeals" element={w(<WorkerAppealsPage />)} />,
    <Route key="w-earnings" path="/worker/earnings" element={w(<WorkerEarningsPage />)} />,
    <Route key="w-training" path="/worker/training" element={w(<WorkerTrainingPage />)} />,
    <Route key="w-goals" path="/worker/goals" element={w(<WorkerGoalsPage />)} />,
  ];
  return [
    <Route key="w" path="/worker" element={w(home || <WorkerDashboard />)} />,
    <Route key="w-job" path="/worker/jobs/:id" element={w(<WorkerJobPage />)} />,
    <Route key="w-kyc" path="/worker/kyc" element={w(<WorkerKycPage />)} />,
    <Route key="w-profile" path="/worker/profile" element={w(<WorkerEditProfilePage />)} />,
    <Route key="w-notif" path="/worker/notifications" element={w(<WorkerNotificationsPage />)} />,
    ...independentOnly,
    <Route key="w-repair" path="/worker/repair/:id" element={w(<WorkerRepairJobPage />)} />,
    <Route key="w-work" path="/worker/work" element={w(<WorkBoardPage kinds={kinds} />)} />,
    <Route key="w-pet" path="/worker/pet" element={<Navigate to="/worker/work" replace />} />,
    <Route key="w-pet-job" path="/worker/pet/:id" element={w(<WorkerPetJobPage />)} />,
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
