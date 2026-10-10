import { Redirect } from 'expo-router';

/**
 * The app opens at "/". Rakshak's home is the website's /worker; the root
 * layout's guard sends anyone signed out to sign-in first.
 */
export default function Index() {
  return <Redirect href={'/worker' as never} />;
}
