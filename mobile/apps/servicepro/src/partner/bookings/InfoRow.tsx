/** One fact on a partner's booking (customer, venue, guests, setup time, note), with an optional action beside it. */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function InfoRow({ Icon, label, value, children }: { Icon: LucideIcon; label: string; value?: string; children?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}><Icon size={16} color={ink[500]} /></View>
      <View style={styles.flex}>
        <Text variant="caption" color={ink[500]}>{label}</Text>
        <Text variant="bodySmall" weight="semibold">{value || '–'}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 32, height: 32, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[50] },
  flex: { flex: 1 },
});
