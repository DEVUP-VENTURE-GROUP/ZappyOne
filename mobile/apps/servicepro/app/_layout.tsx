import '../global.css';
import { AppRoot, AppStack } from '@zappy/ui/app/AppRoot';
import { resolveRoute } from '../routes';

const ROLES = ['shop', 'worker'] as const;

export default function RootLayout() {
  return (
    <AppRoot roles={ROLES} home="/(main)" login="/(auth)/login" resolveRoute={resolveRoute}>
      <AppStack />
    </AppRoot>
  );
}
