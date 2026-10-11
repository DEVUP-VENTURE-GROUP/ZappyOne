/** Save or unsave a décor theme; a guest is asked to sign in first. */
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useToggleSaveEventThemeMutation } from '@zappy/core/api';
import { useAppSelector } from '@zappy/core/store/hooks';
import { toast } from '@zappy/ui/components/Toast';

export function useSaveTheme() {
  const router = useRouter();
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated);
  const [toggle] = useToggleSaveEventThemeMutation();
  return useCallback(async (id: string) => {
    if (!signedIn) { router.push('/(auth)/login' as never); return; }
    try { await toggle(id).unwrap(); } catch { toast.error('Could not save that. Try again.'); }
  }, [signedIn, toggle, router]);
}
