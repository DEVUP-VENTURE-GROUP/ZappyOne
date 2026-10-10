import { WorkerHomeScreen } from '@zappy/ui/worker/screens/WorkerHomeScreen';

export default function Home() {
  return <WorkerHomeScreen kinds={['repair', 'pet', 'helping']} />;
}
