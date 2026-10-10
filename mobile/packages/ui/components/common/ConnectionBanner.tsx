/**
 * A thin banner while the live connection is down, so the provider knows
 * new jobs and updates may be late.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { socketClient } from '@zappy/core/socket/socketClient';
import { Text } from '..';
import { colors, ink } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

export function ConnectionBanner() {
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

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingBottom: 6, backgroundColor: ink[900],
  },
});
