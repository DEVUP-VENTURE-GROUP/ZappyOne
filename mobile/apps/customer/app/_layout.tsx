import '../global.css';
import { AppRoot, AppStack } from '@zappy/ui/app/AppRoot';
import { isPublic, resolveRoute } from '../routes';

const ROLES = ['user'] as const;

export default function RootLayout() {
  return (
    <AppRoot roles={ROLES} home="/" login="/(auth)/login" resolveRoute={resolveRoute} isPublic={isPublic}>
      <AppStack />
    </AppRoot>
  );
}

// A crashed screen retries itself instead of taking the app down.
export { ErrorBoundary } from '@zappy/ui/components/common/ErrorBoundary';
