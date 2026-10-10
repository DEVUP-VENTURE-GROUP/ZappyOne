/**
 * A thank-you that goes entirely to the provider (the website's JobTipCard).
 * While the bill is due it rides on the bill (TipOnBill); after the job, from
 * the wallet or "I gave it in cash". Once per job; amounts from Admin.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Heart } from 'lucide-react-native';
import { useTipJobMutation } from '@zappy/core/api';
import { Button, Chip, Input, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, danger, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { TipOnBill } from './TipOnBill';

export interface TipOptions {
  available?: boolean; beforePayment?: boolean; options: number[]; billPaise?: number; paymentMethod?: string;
  given?: { paise: number; method: 'cash' | 'wallet' | 'with_payment' } | null;
}

const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

export function JobTipCard({ jobId, tip, name, onTipped }: { jobId: string; tip?: TipOptions; name: string | null; onTipped: () => void }) {
  const [tipJob, { isLoading }] = useTipJobMutation();
  const [amount, setAmount] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  if (tip?.beforePayment) return <TipOnBill jobId={jobId} tip={tip} name={name} onTipped={onTipped} />;
  if (tip?.given) {
    const how = tip.given.method === 'cash' ? ' in cash' : tip.given.method === 'with_payment' ? ' with your bill' : '';
    return (
      <View style={[styles.card, styles.row]}>
        <Heart size={18} color={danger[500]} fill={danger[500]} />
        <Text variant="caption" color={ink[700]} style={styles.flex}>You tipped {rupees(tip.given.paise)}{how}. Thank you.</Text>
      </View>
    );
  }
  if (!tip?.available || !tip.options.length) return null;

  async function send(method: 'wallet' | 'cash') {
    try { const r = await tipJob({ id: jobId, amountPaise: (amount || 0) * 100, method, message: message.trim() }).unwrap(); toast.success(r.message); onTipped(); }
    catch (err) { toast.error(errText(err, 'Could not send the tip. Try again.')); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}><Heart size={16} color={danger[500]} /><Text variant="bodySmall" weight="semibold">Thank {name || 'them'} with a tip</Text></View>
      <Text variant="caption" color={ink[500]}>All of it goes to them.</Text>
      <View style={styles.chips}>{tip.options.map((r) => <Chip key={r} label={`₹${r}`} tone="red" selected={amount === r} onPress={() => setAmount(r)} />)}</View>
      {amount ? (
        <>
          <Input value={message} onChangeText={setMessage} maxLength={200} placeholder="Say thanks (optional)" />
          <View style={styles.row}>
            <View style={styles.flex}><Button label={`Tip ₹${amount} from wallet`} size="small" loading={isLoading} onPress={() => send('wallet')} fullWidth /></View>
            <View style={styles.flex}><Button label="I gave it in cash" size="small" variant="outline" disabled={isLoading} onPress={() => send('cash')} fullWidth /></View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
