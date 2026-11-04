/**
 * What the customer pays, said before the button (the website's confirm price
 * card): the inspection fee, a fixed total with the server's bill lines
 * (travel or pickup, platform fee, small-job top-up, taxes), surge and tip each
 * shown as their own line, or a plain "priced after inspection".
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { billExtras, totalOf, visitNote, billWords } from '@zappy/core/shared/repairBill';
import { Text } from '@zappy/ui/components';
import { SurgeLines, type SurgeQuote } from '@zappy/ui/components/booking/SurgeLines';
import { accent, danger, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { flow } from './FlowChrome';
import type { RepairBill } from './repairRules';

export function RepairPriceCard({ inspectionOnly, price, bill, surgeQuote, surgePaise, tip, serviceMode, terms }: {
  inspectionOnly: boolean; price: number | null | undefined; bill: RepairBill | null | undefined; surgeQuote: SurgeQuote | null; surgePaise: number; tip: number;
  serviceMode?: string; terms?: { job?: string; pro?: string; packaged?: boolean };
}) {
  const words = billWords(terms);
  const visit = visitNote(bill, serviceMode, terms?.pro);
  // The total up front; how it is made up (fees, late-night, distance) one tap away.
  const [details, setDetails] = useState(false);
  const extras = billExtras(bill);
  const total = (totalOf({ pricePaise: price ?? null, bill }) || 0) + surgePaise + tip * 100;
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
      {extras.length || surgePaise > 0 || tip > 0 ? (
        <Text variant="caption" weight="semibold" color={zappy[700]} style={styles.link} onPress={() => setDetails((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: details }}>
          {details ? 'Hide price details' : 'See price details'}
        </Text>
      ) : null}
      {details ? (
        <View style={styles.details}>
          <Text variant="caption" weight="semibold" color={ink[700]}>{formatPaise(price)} {words.base.replace(', plus:', '')}</Text>
          {extras.map((l) => <View key={l.label} style={styles.total}><Text variant="caption" weight="semibold" color={ink[700]}>{l.label}</Text><Text variant="caption" weight="semibold" color={ink[700]}>+{formatPaise(l.paise)}</Text></View>)}
          <SurgeLines quote={surgeQuote} />
          {tip > 0 ? <View style={styles.total}><Text variant="caption" weight="semibold" color={danger[600]}>Tip for your pro</Text><Text variant="caption" weight="semibold" color={danger[600]}>+₹{tip}</Text></View> : null}
          {visit ? <Text variant="caption" color={ink[700]}>{visit}</Text> : null}
        </View>
      ) : null}
      <Text variant="caption" color={ink[400]}>{words.includes}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  link: { textDecorationLine: 'underline' },
  details: { gap: 6, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: slate[50] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
});
