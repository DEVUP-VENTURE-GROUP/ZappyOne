/**
 * The bottom of a helping booking (the websites' price card and checkout):
 * the service fee line by line with any surge and tip, the item budget shown
 * apart from it, then tip, someone else on site and cash.
 */
import { StyleSheet, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { PayMethodPicker, PendingFeeNotice, SomeoneElse, TipAtCheckout } from '@zappy/ui/components/booking/Checkout';
import { SurgeLines, type SurgeQuote } from '@zappy/ui/components/booking/SurgeLines';
import { useT } from '@zappy/ui/lib/i18n';
import { danger, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HelpingCharge } from './useHelpingBooking';

export function HelpingCheckout({ charge, note, surgeQuote, surgePaise, tip, onTip, onSite, itemBudgetPaise = 0, totalLabel }: {
  charge?: HelpingCharge; note?: string; surgeQuote: SurgeQuote | null; surgePaise: number; tip: number; onTip: (r: number) => void;
  onSite: (v: { name: string; phone: string } | 'incomplete' | null) => void; itemBudgetPaise?: number; totalLabel: string;
}) {
  const t = useT();
  const lines = charge ? ([
    ['Service fee', charge.baseFeePaise], ['Distance', charge.distanceFeePaise], ['Extra stops', charge.multiStopFeePaise], ['Special handling', charge.specialHandlingPaise],
    ['Platform fee', charge.platformFeePaise], ['Discount', -(charge.discountPaise || 0)], ['Taxes', charge.taxPaise],
  ] as [string, number | undefined][]).filter(([, p]) => p) as [string, number][] : [];
  return (
    <View style={styles.gap}>
      {charge ? (
        <View style={styles.card}>
          {note ? <View style={styles.note}><Info size={14} color={zappy[700]} /><Text variant="caption" color={zappy[700]} style={styles.flex}>{note}</Text></View> : null}
          {lines.map(([label, p]) => <View key={label} style={styles.line}><Text variant="bodySmall" color={ink[500]}>{t(`helpQuote.${label}`, label)}</Text><Text variant="bodySmall" color={ink[500]}>{p < 0 ? `− ${formatPaise(-p)}` : formatPaise(p)}</Text></View>)}
          <View style={[styles.line, styles.total]}><Text variant="bodySmall" weight="bold">{totalLabel}</Text><Text variant="bodySmall" weight="bold">{formatPaise(charge.serviceChargePaise + surgePaise + tip * 100)}</Text></View>
          <SurgeLines quote={surgeQuote} />
          {tip > 0 ? <View style={styles.line}><Text variant="caption" weight="semibold" color={danger[600]}>{t('helpQuote.tip', 'Tip for your helper')}</Text><Text variant="caption" weight="semibold" color={danger[600]}>+₹{tip}</Text></View> : null}
          {itemBudgetPaise > 0 ? <View style={styles.line}><Text variant="bodySmall" weight="bold" color={ink[500]}>{t('helpQuote.budget', 'Item budget (max)')}</Text><Text variant="bodySmall" weight="bold" color={ink[500]}>up to {formatPaise(itemBudgetPaise)}</Text></View> : null}
        </View>
      ) : null}
      {charge ? <TipAtCheckout value={tip} onChange={onTip} /> : null}
      <SomeoneElse onChange={onSite} />
      <PendingFeeNotice />
      <PayMethodPicker cashNote={t('helpQuote.cash', "Pay the helper's service charge in cash when the task is done.")} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: zappy[100], backgroundColor: zappy[50] },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  flex: { flex: 1 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  total: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: zappy[100] },
});
