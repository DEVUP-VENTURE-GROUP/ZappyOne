// Stores is an action, not a tab: the native iOS bar needs a route behind every item, so a stray visit goes where Stores goes.
import { Redirect } from 'expo-router';

export default function StoresSlot() {
  return <Redirect href={'/nearby-shops' as never} />;
}
