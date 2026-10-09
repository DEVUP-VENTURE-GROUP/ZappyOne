/**
 * Sign out of this device: revoke the refresh token on the server (best
 * effort), forget the stored session, and let the root layout tear down and
 * route to sign-in (lib/sessionBus).
 */
import { useCallback } from 'react';
import { useLogoutMutation } from '../api/authApi';
import { clearSession, getRefreshToken } from '../api/tokenStorage';
import { emitSessionEnd } from '../lib/sessionBus';

export function useSignOut(): () => Promise<void> {
  const [logout] = useLogoutMutation();
  return useCallback(async () => {
    const refreshToken = await getRefreshToken();
    if (refreshToken) await logout({ refreshToken }).unwrap().catch(() => {});
    await clearSession();
    emitSessionEnd('user_initiated');
  }, [logout]);
}
