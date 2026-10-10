/** All / Completed / Cancelled over the past list, each with its count (the website's FilterChips). */
import { StyleSheet, View } from 'react-native';
import { Chip } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { spacing } from '@zappy/ui/theme/spacing';

export type PastFilter = 'all' | 'completed' | 'cancelled';

export function FilterChips({ filter, onChange, counts }: { filter: PastFilter; onChange: (f: PastFilter) => void; counts: Record<PastFilter, number> }) {
  const t = useT();
  const opts: [PastFilter, string][] = [['all', t('activity.filter.all', 'All')], ['completed', t('activity.filter.completed', 'Completed')], ['cancelled', t('activity.filter.cancelled', 'Cancelled')]];
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {opts.map(([key, label]) => <Chip key={key} label={`${label} ${counts[key]}`} selected={filter === key} onPress={() => onChange(key)} />)}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: spacing.sm } });
