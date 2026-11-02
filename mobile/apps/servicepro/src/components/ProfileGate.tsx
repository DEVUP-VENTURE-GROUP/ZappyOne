/** Until every required detail is filled (server onboarding/profile-check), the dashboard sends the partner to the finish-profile list (the website's ProfileGate). */
import { Redirect, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { useProviderProfileStatusQuery } from '@zappy/core/api';

// The web addresses the server names, as this app's screens.
export const MOBILE_PATH: Record<string, string> = { '/partner/profile': '/partner/account' };
const ALWAYS = ['/shop/profile', '/shop/kyc', '/shop/account', '/worker/profile', '/worker/kyc', '/partner/account', '/partner/kyc', '/finish-profile'];

export function ProfileGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data } = useProviderProfileStatusQuery(undefined, { refetchOnMountOrArgChange: 30 });
  if (!data || data.complete || ALWAYS.some((p) => path.startsWith(p))) return <>{children}</>;
  return <Redirect href={'/finish-profile' as never} />;
}
