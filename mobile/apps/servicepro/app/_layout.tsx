import '../global.css';
import { AppRoot, AppStack } from '@zappy/ui/app/AppRoot';
import { AccountSetupGate } from '@zappy/ui/components/account/AccountSetupGate';
import { WorkerFrame } from '@zappy/ui/provider/WorkerFrame';
import { isPublic, resolveRoute } from '../routes';
import { homeFor } from '../src/menus';

/** Shops and their technicians, and event partners, as on the web. */
const ROLES = ['shop', 'worker', 'event_partner'] as const;
/** The kinds of work a shop takes (the website's JobOfferHost kinds). */
const KINDS = ['repair', 'pet'];

export default function RootLayout() {
  return (
    <AppRoot roles={ROLES} home={homeFor} login="/(auth)/login" resolveRoute={resolveRoute} isPublic={isPublic}>
      <AccountSetupGate roles={ROLES} appName="ServicePro">
        <AppStack />
        <WorkerFrame kinds={KINDS} />
      </AccountSetupGate>
    </AppRoot>
  );
}

// A crashed screen retries itself instead of taking the app down.
export { ErrorBoundary } from '@zappy/ui/components/common/ErrorBoundary';
