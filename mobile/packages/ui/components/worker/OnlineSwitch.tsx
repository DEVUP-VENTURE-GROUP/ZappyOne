/**
 * The online / offline switch at the top of the provider dashboard.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Radio } from 'lucide-react-native';
import { Text } from '..';
import { colors, ink, slate, success } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

/* The master switch: the pill shows the state and flips it. */
export function OnlineSwitch({ isOnline, busy, onToggle }: { isOnline: boolean; busy?: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={busy}
      accessibilityRole="switch"
      accessibilityState={{ checked: isOnline, busy: !!busy }}
      accessibilityLabel={isOnline ? 'Online. Tap to go offline' : 'Offline. Tap to go online'}
      style={[styles.switch, isOnline ? styles.switchOn : styles.switchOff]}
    >
      {busy ? <ActivityIndicator size="small" color={isOnline ? success[600] : ink[500]} />
        : <Radio size={16} strokeWidth={2.6} color={isOnline ? success[600] : ink[400]} />}
      <Text variant="bodySmall" weight="bold" color={isOnline ? success[700] : ink[700]}>{isOnline ? 'Online' : 'Go online'}</Text>
      <View style={[styles.track, { backgroundColor: isOnline ? success[500] : slate[300] }]}>
        <View style={[styles.knob, { left: isOnline ? 18 : 2 }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44 },
  switchOn: { backgroundColor: success[50], borderColor: success[100] },
  switchOff: { backgroundColor: colors.surface, borderColor: colors.border },
  track: { width: 36, height: 20, borderRadius: radius.pill },
  knob: { position: 'absolute', top: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },
});
