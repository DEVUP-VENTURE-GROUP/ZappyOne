/** One number on the partner's home, with what it means. */
import { StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function OverviewStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.card}>
      <Text variant="caption" weight="semibold" color={ink[500]}>{label}</Text>
      <Text variant="heading2" weight="black">{value}</Text>
      {hint ? <Text variant="caption" color={ink[400]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexBasis: '47%', flexGrow: 1, gap: 2, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
