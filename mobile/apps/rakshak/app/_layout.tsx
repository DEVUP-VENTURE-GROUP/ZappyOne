import '../global.css';
import { AppRoot, AppStack } from '@zappy/ui/app/AppRoot';
import { WorkerFrame } from '@zappy/ui/worker/WorkerFrame';
import { resolveRoute } from '../routes';

const ROLES = ['worker'] as const;
/** The kinds of work Rakshak providers do (the website's JobOfferHost kinds). */
const KINDS = ['repair', 'pet', 'helping'];

export default function RootLayout() {
  return (
    <AppRoot roles={ROLES} home="/worker" login="/(auth)/login" resolveRoute={resolveRoute}>
      <AppStack />
      <WorkerFrame kinds={KINDS} />
    </AppRoot>
  );
}
