/**
 * What runs around every screen of a provider app while signed in (the
 * websites' App shell for Rakshak / ServicePro):
 *   - the job-offer popup (OfferHost)
 *   - location and heartbeat while online (useOnlinePresence)
 *   - lists refresh on live job changes, a tip shows a toast (useJobRealtime)
 *   - a banner while the live connection is down
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { useGetWorkerMeQuery } from '@zappy/core/api';
import { useAppSelector } from '@zappy/core/store/hooks';
import { useOnlinePresence } from '@zappy/core/hooks/useOnlinePresence';
import { useJobRealtime } from '@zappy/core/hooks/useJobRealtime';
import { socketClient } from '@zappy/core/socket/socketClient';
import { Text } from '../components';
import { toast } from '../components/Toast';
import { colors, ink } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { OfferHost } from './OfferHost';

function ConnectionBanner() {
  const insets = useSafeAreaInsets();
  const [down, setDown] = useState(false);
  useEffect(() => {
    let since: number | null = null;
    const t = setInterval(() => {
      if (socketClient.isConnected) { since = null; setDown(false); return; }
      since ??= Date.now();
      // A blip while reconnecting isn't worth a banner.
      setDown(Date.now() - since > 6000);
    }, 2000);
    return () => clearInterval(t);
  }, []);
  if (!down) return null;
  return (
    <View pointerEvents="none" style={[styles.banner, { paddingTop: insets.top + 6 }]} accessibilityRole="alert">
      <WifiOff size={14} color={colors.textInverse} />
      <Text variant="caption" weight="semibold" color={colors.textInverse}>No connection. Jobs and updates will arrive once you're back online.</Text>
    </View>
  );
}

export function WorkerFrame({ kinds }: { kinds: string[] }) {
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated);
  const role = useAppSelector((s) => s.auth.role);
  const isWorker = signedIn && role === 'worker';
  const { data, refetch } = useGetWorkerMeQuery(undefined, { skip: !isWorker, pollingInterval: 60000 });
  const me = data?.worker;

  useOnlinePresence({
    online: isWorker && !!me?.isOnline,
    currentOrderId: me?.currentOrderId,
    onWentOffline: (why) => {
      toast(why === 'no_signal'
        ? 'We lost contact with your phone, so you were set offline. Go online to get jobs again.'
        : 'You are offline now. Go online to get jobs again.', { id: 'presence-offline' });
      refetch();
    },
  });
  useJobRealtime({
    enabled: signedIn,
    onTip: (tip) => toast.success(`₹${Math.round(tip / 100)} tip from your customer. It is all yours.`, { duration: 6000 }),
  });

  if (!signedIn) return null;
  return (
    <>
      <ConnectionBanner />
      <OfferHost kinds={kinds} />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingBottom: 6, backgroundColor: ink[900],
  },
});
