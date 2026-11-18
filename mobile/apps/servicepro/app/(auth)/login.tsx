import { WorkerLoginPage } from '@zappy/ui/provider/pages/WorkerLoginPage';

/** One way in for every partner (the website's ServiceProLogin): the number's accounts decide what opens after the code; a password belongs to one account, so the person picks which. */
export default function LoginScreen() {
  return (
    <WorkerLoginPage title="ZappyOne ServicePro" subtitle="Shop owners, solo pros, technicians and event partners all sign in here" role="shop"
      passwordRoles={[['shop', 'Shop or solo pro'], ['worker', 'Technician'], ['event_partner', 'Event partner']]} />
  );
}
