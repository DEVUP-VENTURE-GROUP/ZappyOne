import '../global.css';
import { AppRoot, AppStack } from '@zappy/ui/app/AppRoot';
import { resolveRoute } from '../routes';

const ROLES = ['user'] as const;

export default function RootLayout() {
  return (
    <AppRoot roles={ROLES} home="/(main)" login="/(auth)/login" resolveRoute={resolveRoute}>
      <AppStack />
    </AppRoot>
  );
}

// A crashed screen retries itself instead of taking the app down.
export { ErrorBoundary } from '@zappy/ui/components/common/ErrorBoundary';
