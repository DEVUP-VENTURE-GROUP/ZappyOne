import { WorkerDashboard } from '@zappy/ui/provider/pages/WorkerDashboard';

export default function Home() {
  return <WorkerDashboard kinds={['repair', 'pet', 'helping']} />;
}
