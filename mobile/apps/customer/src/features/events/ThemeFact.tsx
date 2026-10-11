/** One fact about a theme in a tile: setup time, capacity. */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function ThemeFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View style={styles.card}>
      {icon}
      <Text variant="caption" weight="bold" color={ink[400]}>{label.toUpperCase()}</Text>
      <Text variant="heading3" weight="black">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
