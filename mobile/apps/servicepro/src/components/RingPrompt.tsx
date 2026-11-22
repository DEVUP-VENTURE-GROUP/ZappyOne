// A new job rings full screen like a call; Android 14 and newer ask the pro to allow it. One check for the home prompt and the Account setting, refreshed when they come back from Settings.
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { BellRing } from 'lucide-react-native';
import { zappyNative } from '@zappy/native';
import { Button, Text } from '@zappy/ui/components';
import { accent, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function useCanRing() {
  const [on, setOn] = useState(() => zappyNative.canFullScreen());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setOn(zappyNative.canFullScreen()); });
    return () => sub.remove();
  }, []);
  return { available: zappyNative.available, on, open: () => zappyNative.openFullScreenSettings() };
}

/** On the home screen only while new jobs cannot fill a locked screen. */
export function RingPrompt() {
  const ring = useCanRing();
  if (!ring.available || ring.on) return null;
  return (
    <View style={styles.card} accessibilityRole="summary">
      <BellRing size={20} color={accent[700]} />
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="bold">Never miss a job</Text>
        <Text variant="caption" color={ink[700]}>Allow new jobs to fill your screen and ring like a call, even when the phone is locked.</Text>
      </View>
      <Button label="Allow" size="small" onPress={ring.open} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, backgroundColor: accent[50], borderWidth: 1, borderColor: accent[100] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
});
