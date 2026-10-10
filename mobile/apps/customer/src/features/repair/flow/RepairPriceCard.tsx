/**
 * What the customer pays, said before the button (the website's confirm price
 * card): the inspection fee, a fixed total with any surge and tip shown as
 * their own lines, or a plain "priced after inspection".
 */
import { StyleSheet, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { SurgeLines, type SurgeQuote } from '@zappy/ui/components/booking/SurgeLines';
import { accent, danger, ink } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { flow } from './FlowChrome';

export function RepairPriceCard({ inspectionOnly, price, surgeQuote, surgePaise, tip, pickup }: {
  inspectionOnly: boolean; price: number | null | undefined; surgeQuote: SurgeQuote | null; surgePaise: number; tip: number; pickup: boolean;
}) {
  const total = (price || 0) + surgePaise + tip * 100;
  if (inspectionOnly) {
    return (
      <View style={flow.card}>
        <View style={styles.total}>
          <Text variant="bodySmall" weight="bold">Inspection fee</Text>
          <Text variant="heading2" weight="black">{price == null ? '…' : total > 0 ? formatPaise(total) : 'Free'}</Text>
        </View>
        <SurgeLines quote={surgeQuote} />
        <Text variant="caption" color={ink[500]}>{price ? 'Charged by ZappyOne for the technician’s visit and diagnosis. If you go ahead with the repair afterwards, this amount comes off the repair bill, so you are not charged twice for the same visit.'
          : 'A technician visits and tells you what is wrong. You only pay if you go ahead with the repair they quote.'}</Text>
      </View>
    );
  }
  if (price == null) {
    return (
      <View style={[flow.card, styles.row]}>
        <AlertTriangle size={16} color={accent[600]} />
        <Text variant="caption" color={accent[700]} style={flow.flex}>This repair is priced after inspection. The technician will send you a quote, and no work starts until you approve it.</Text>
      </View>
    );
  }
  return (
    <View style={flow.card}>
      <View style={styles.total}>
        <Text variant="bodySmall" weight="bold">Total</Text>
        <Text variant="heading2" weight="black">{formatPaise(total)}</Text>
      </View>
      {surgePaise > 0 || tip > 0 ? <Text variant="caption" color={ink[500]}>{formatPaise(price)} for the repair, plus:</Text> : null}
      <SurgeLines quote={surgeQuote} />
      {tip > 0 ? <View style={styles.total}><Text variant="caption" weight="semibold" color={danger[600]}>Tip for your pro</Text><Text variant="caption" weight="semibold" color={danger[600]}>+₹{tip}</Text></View> : null}
      <Text variant="caption" color={ink[400]}>Includes parts, labour and taxes. This is the price you pay: nothing is added later without your approval.</Text>
      {pickup ? <Text variant="caption" color={ink[500]}>Pickup and return are included in this total.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
});
