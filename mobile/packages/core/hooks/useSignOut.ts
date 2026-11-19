/**
 * Sign out of this device: revoke the refresh token on the server (best
 * effort), forget the stored session, and let the root layout tear down and
 * route to sign-in (lib/sessionBus).
 */
import { useCallback } from 'react';
import { useLogoutMutation } from '../api/hooks';
import { clearSession, getRefreshToken } from '../api/tokenStorage';
import { emitSessionEnd } from '../lib/sessionBus';
import { getDeviceToken } from '../lib/pushNotifications';

export function useSignOut(): () => Promise<void> {
  const [logout] = useLogoutMutation();
  return useCallback(async () => {
    const refreshToken = await getRefreshToken();
    // This phone's push token comes off the account too, so it stops getting its offers and booking updates.
    // Never waits on push: no network or a failed APNs registration can stall the token call, so it gets 2 seconds.
    const push = refreshToken ? await Promise.race([getDeviceToken().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2000))]) : null;
    if (refreshToken) await logout(push ? { refreshToken, pushToken: push.token } : refreshToken).unwrap().catch(() => {});
    await clearSession();
    emitSessionEnd('user_initiated');
  }, [logout]);
}
