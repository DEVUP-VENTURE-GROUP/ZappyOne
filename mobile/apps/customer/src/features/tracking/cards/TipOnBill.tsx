/**
 * The bill is ready (the website's TipOnBill): the amount, an optional tip
 * that rides on it, and the total to pay with it in. Changeable until paid;
 * the provider's screen updates at once.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Banknote, Heart, Receipt, Smartphone } from 'lucide-react-native';
import { useTipJobMutation } from '@zappy/core/api';
import { Chip, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, danger, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { TipOptions } from './JobTipCard';

const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

export function TipOnBill({ jobId, tip, name, onTipped }: { jobId: string; tip: TipOptions; name: string | null; onTipped: () => void }) {
  const [tipJob, { isLoading }] = useTipJobMutation();
  const onBill = tip.given?.method === 'with_payment' ? tip.given.paise : 0;
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setPicked(null); }, [onBill]);
  const current = picked ?? Math.round(onBill / 100);
  const bill = tip.billPaise || 0;
  const total = bill + current * 100;
  const who = name || 'your provider';

  async function choose(r: number) {
    if (isLoading || r === current) return;
    setPicked(r);
    try { const res = await tipJob({ id: jobId, amountPaise: r * 100, method: 'with_payment' }).unwrap(); toast.success(res.message); onTipped(); }
    catch (err) { setPicked(null); toast.error(errText(err, 'Could not update the tip. Try again.')); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.bill}>
        <View style={styles.inline}><Receipt size={16} color={zappy[600]} /><Text variant="bodySmall" weight="semibold">Your bill</Text></View>
        <Text variant="body" weight="bold">{rupees(bill)}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.inline}><Heart size={16} color={danger[500]} fill={current ? danger[500] : 'transparent'} /><Text variant="bodySmall" weight="bold">Add a tip for {who}?</Text></View>
        <Text variant="caption" color={ink[500]}>Optional. Every rupee goes to {name || 'them'}.</Text>
        <View style={styles.chips}>
          {tip.options.map((r) => <Chip key={r} label={`₹${r}`} tone="red" selected={current === r} onPress={() => choose(r)} />)}
          <Chip label="No tip" selected={current === 0} onPress={() => choose(0)} />
        </View>
        <View style={styles.sum}>
          <View style={styles.line}><Text variant="caption" color={ink[500]}>Bill</Text><Text variant="caption" color={ink[500]}>{rupees(bill)}</Text></View>
          {current > 0 ? <View style={styles.line}><Text variant="caption" weight="semibold" color={danger[600]}>Tip for {name || 'them'}</Text><Text variant="caption" weight="semibold" color={danger[600]}>+ ₹{current}</Text></View> : null}
          <View style={styles.line}><Text variant="body" weight="black">To pay</Text><View style={styles.inline}>{isLoading ? <ActivityIndicator size="small" color={slate[400]} /> : null}<Text variant="body" weight="black">{rupees(total)}</Text></View></View>
        </View>
        <View style={styles.note}>
          {tip.paymentMethod === 'cash' ? <Banknote size={14} color={zappy[800]} /> : <Smartphone size={14} color={zappy[800]} />}
          <Text variant="caption" color={zappy[800]} style={styles.flex}>{tip.paymentMethod === 'cash' ? `Hand ${rupees(total)} in cash to ${who}. They record it before closing the job.` : `Pay ${rupees(total)} below${current ? ', tip included' : ''}. You can change the tip until you pay.`}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  bill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: slate[50] },
  body: { gap: spacing.sm, padding: spacing.base },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  sum: { gap: 4, marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.border },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: zappy[50] },
  flex: { flex: 1 },
});
