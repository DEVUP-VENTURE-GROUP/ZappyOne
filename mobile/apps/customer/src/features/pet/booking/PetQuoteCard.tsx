/** The price of a pet booking, per pet and every other line, adding up to the total. */
import { StyleSheet, View } from 'react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { petExtraLines, type PetQuote } from './petBookingRules';

export function PetQuoteCard({ quote, names }: { quote: PetQuote; names: string[] }) {
  const t = useT();
  return (
    <View style={styles.card}>
      {quote.lines.map((l, i) => <View key={i} style={styles.line}><Text variant="bodySmall">{names[i]}</Text><Text variant="bodySmall">{formatPaise(l.linePaise)}</Text></View>)}
      {petExtraLines(quote).map(([label, p]) => (
        <View key={label} style={styles.line}><Text variant="bodySmall" color={ink[500]}>{t(`petQuote.${label}`, label)}</Text><Text variant="bodySmall" color={ink[500]}>{p < 0 ? `− ${formatPaise(-p)}` : formatPaise(p)}</Text></View>
      ))}
      <View style={[styles.line, styles.total]}><Text variant="bodySmall" weight="black">{t('common.total', 'Total')}</Text><Text variant="bodySmall" weight="black">{formatPaise(quote.totalPaise)}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: zappy[100], backgroundColor: zappy[50] },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  total: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: zappy[100] },
});
