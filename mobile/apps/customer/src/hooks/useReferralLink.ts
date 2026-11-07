// A friend's invite link (zappyone.com/...?ref=CODE) that opened the app: kept until a customer signs in, then applied once (the website's useReferralLink).
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApplyReferralMutation } from '@zappy/core/api';
import { cleanReferralCode } from '@zappy/core/shared/referralCode';
import { useAppSelector } from '@zappy/core/store/hooks';
import { toast } from '@zappy/ui/components/Toast';

const KEY = 'zappy:ref';

export function useReferralLink(): void {
  const url = Linking.useURL();
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const [apply] = useApplyReferralMutation();

  useEffect(() => {
    if (!url) return;
    const ref = cleanReferralCode(Linking.parse(url).queryParams?.ref);
    if (ref) AsyncStorage.setItem(KEY, ref).catch(() => {});
  }, [url]);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    (async () => {
      const code = await AsyncStorage.getItem(KEY).catch(() => null);
      if (!code || !live) return;
      await AsyncStorage.removeItem(KEY).catch(() => {});
      apply(code).unwrap().then(() => toast.success("Your friend's referral is applied")).catch(() => {});
    })();
    return () => { live = false; };
  }, [signedIn, apply]);
}
