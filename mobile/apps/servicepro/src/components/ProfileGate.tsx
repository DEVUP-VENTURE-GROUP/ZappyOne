/** Until every required detail is filled (server onboarding/profile-check), the dashboard sends the partner to the finish-profile list (the website's ProfileGate). */
import { Redirect, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { useProviderProfileStatusQuery } from '@zappy/core/api';
import { ErrorState, LoadingState } from '@zappy/ui/components';

// The web addresses the server names, as this app's screens.
export const MOBILE_PATH: Record<string, string> = { '/partner/profile': '/partner/account' };
const ALWAYS = ['/shop/profile', '/shop/work', '/shop/kyc', '/shop/account', '/shop/bank', '/worker/bank', '/worker/profile', '/worker/kyc', '/partner/account', '/partner/kyc', '/finish-profile'];

export function ProfileGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data, isError, refetch } = useProviderProfileStatusQuery(undefined, { refetchOnMountOrArgChange: 30 });
  if (ALWAYS.some((p) => path.startsWith(p)) || data?.complete) return <>{children}</>;
  // Never opens the dashboard before the check says so: a slow or failed check waits or offers a retry.
  if (!data && isError) return <ErrorState title="Could not check your profile" message="Check your internet and try again." onRetry={refetch} />;
  if (!data) return <LoadingState />;
  return <Redirect href={'/finish-profile' as never} />;
}
