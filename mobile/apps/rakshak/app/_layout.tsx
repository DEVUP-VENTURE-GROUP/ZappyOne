import '../global.css';
import { AppRoot, AppStack } from '@zappy/ui/app/AppRoot';
import { AccountSetupGate } from '@zappy/ui/components/account/AccountSetupGate';
import { WorkerFrame } from '@zappy/ui/provider/WorkerFrame';
import { isPublic, resolveRoute } from '../routes';

const ROLES = ['worker'] as const;
/** The kinds of work Rakshak providers do (the website's JobOfferHost kinds). */
const KINDS = ['repair', 'pet', 'helping'];

export default function RootLayout() {
  return (
    <AppRoot roles={ROLES} home="/worker" login="/(auth)/login" resolveRoute={resolveRoute} isPublic={isPublic}>
      <AccountSetupGate roles={ROLES} appName="Rakshak">
        <AppStack />
        <WorkerFrame kinds={KINDS} />
      </AccountSetupGate>
    </AppRoot>
  );
}

// A crashed screen retries itself instead of taking the app down.
export { ErrorBoundary } from '@zappy/ui/components/common/ErrorBoundary';
