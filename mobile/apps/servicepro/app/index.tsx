import { Redirect } from 'expo-router';
import { useAppSelector } from '@zappy/core/store/hooks';
import { homeFor } from '../src/menus';

/** Opening the app lands on the right home: the shop for an owner, the job list for a technician. */
export default function Index() {
  const role = useAppSelector((s) => s.auth.role);
  return <Redirect href={homeFor(role) as never} />;
}
