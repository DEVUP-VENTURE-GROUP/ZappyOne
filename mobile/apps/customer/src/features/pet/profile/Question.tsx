/** One profile question with its choices as chips; the label turns red when it was skipped on save. */
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { danger, ink } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Option } from './petProfileOptions';

export function Question({ label, missing, options, value, onChange, scroll = false, keyPrefix }: {
  label: string; missing: boolean; options: Option[]; value: string | number | ''; onChange: (v: string | number) => void; scroll?: boolean; keyPrefix?: string;
}) {
  const t = useT();
  const chips = options.map((o) => <Chip key={String(o.value)} label={keyPrefix ? t(`${keyPrefix}.${o.value}`, o.label) : o.label} selected={value === o.value} onPress={() => onChange(o.value)} />);
  return (
    <View style={styles.gap}>
      <Text variant="caption" weight="bold" color={missing ? danger[600] : ink[900]}>{label}</Text>
      {scroll ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{chips}</ScrollView> : <View style={[styles.row, styles.wrap]}>{chips}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 6 },
  row: { flexDirection: 'row', gap: spacing.sm },
  wrap: { flexWrap: 'wrap' },
});
