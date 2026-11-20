import '../global.css';
import { AppRoot, AppStack } from '@zappy/ui/app/AppRoot';
import { isPublic, resolveRoute } from '../routes';
import { useReferralLink } from '../src/hooks/useReferralLink';
import { setCelebration } from '@zappy/ui/components/common/celebrationSlot';
import { Confetti } from '../src/Confetti';

// The confetti on big moments (shared celebrationSlot).
setCelebration(Confetti);

function CustomerHooks() {
  useReferralLink();
  return null;
}

const ROLES = ['user'] as const;

export default function RootLayout() {
  return (
    <AppRoot roles={ROLES} home="/" login="/(auth)/login" resolveRoute={resolveRoute} isPublic={isPublic}>
      <CustomerHooks />
      <AppStack />
    </AppRoot>
  );
}

// A crashed screen retries itself instead of taking the app down.
export { ErrorBoundary } from '@zappy/ui/components/common/ErrorBoundary';
