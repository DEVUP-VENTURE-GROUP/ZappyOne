/** Every quote on the booking, by revision, with its outcome and total. */
import { StyleSheet, View } from 'react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Quote } from './QuoteCard';

export function QuoteHistory({ quotes }: { quotes: Quote[] }) {
  if (!quotes.length) return null;
  return (
    <View style={styles.card}>
      <Text variant="bodySmall" weight="bold">Quote history</Text>
      {quotes.map((q) => (
        <View key={q._id} style={styles.row}>
          <Text variant="caption" color={ink[500]}>Revision {q.revision} · {q.status.replace(/_/g, ' ')}</Text>
          <Text variant="caption" weight="semibold">{formatPaise(q.totalPaise)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
