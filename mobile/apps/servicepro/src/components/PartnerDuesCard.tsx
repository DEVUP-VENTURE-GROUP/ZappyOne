/** What this business owes ZappyOne from cash jobs, and telling ZappyOne once it has paid (the website's PartnerDuesCard); hidden when nothing is owed. */
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AlertTriangle, CircleCheck, Clock3, Wallet } from 'lucide-react-native';
import { useClaimShopDuesPaymentMutation, useShopDuesQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, colors, danger, ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Claim { _id: string; amountPaise: number; reference: string; status: 'pending' | 'confirmed' | 'rejected' }
interface Dues { duesPaise: number; limitPaise: number; warnPaise: number; isBlocked: boolean; payInstructions: string; claims?: Claim[] }
const STATE = { pending: ['Being checked', Clock3, accent[700]], confirmed: ['Received', CircleCheck, success[700]], rejected: ['Not found', AlertTriangle, danger[600]] } as const;

export function PartnerDuesCard() {
  const { data } = useShopDuesQuery(undefined, { pollingInterval: 120000 });
  const [claim, { isLoading }] = useClaimShopDuesPaymentMutation();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const d = data as Dues | undefined;
  if (!d || (d.duesPaise <= 0 && !d.claims?.some((c) => c.status === 'pending'))) return null;
  const near = !d.isBlocked && d.duesPaise >= d.warnPaise;
  const send = async () => {
    try {
      await claim({ amountRupees: Number(amount), reference: reference.trim(), method: 'upi' }).unwrap();
      toast.success('Sent. ZappyOne will check it and update your balance.');
      setOpen(false); setAmount(''); setReference('');
    } catch (err) { toast.error(errText(err, 'Could not send. Try again.')); }
  };
  return (
    <View style={[styles.card, d.isBlocked ? styles.stopped : near ? styles.near : null]}>
      <View style={styles.head}>
        {d.isBlocked ? <AlertTriangle size={18} color={danger[600]} /> : <Wallet size={18} color={ink[500]} />}
        <Text variant="body" weight="bold">You owe ZappyOne {formatPaise(d.duesPaise)}</Text>
      </View>
      <Text variant="caption" color={ink[500]}>
        {d.isBlocked ? `New jobs are paused until it is under ${formatPaise(d.limitPaise)}.` : `ZappyOne fees from cash jobs. New jobs pause at ${formatPaise(d.limitPaise)}.`} Online jobs pay it down by themselves.
      </Text>
      {d.payInstructions ? <View style={styles.pay}><Text variant="caption" weight="semibold">{d.payInstructions}</Text></View> : null}
      {(d.claims || []).slice(0, 3).map((c) => { const [label, Icon, tone] = STATE[c.status] || STATE.pending; return (
        <View key={c._id} style={styles.head}><Icon size={14} color={tone} /><Text variant="caption" weight="semibold" color={tone}>{formatPaise(c.amountPaise)} · {c.reference} · {label}</Text></View>
      ); })}
      {open ? (
        <View style={styles.form}>
          <TextInput value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="Amount ₹" accessibilityLabel="Amount paid in rupees" placeholderTextColor={ink[400]} style={styles.input} />
          <TextInput value={reference} onChangeText={setReference} maxLength={80} autoCapitalize="characters" placeholder="UPI or bank reference" accessibilityLabel="Payment reference" placeholderTextColor={ink[400]} style={styles.input} />
          <Button label="Send" onPress={send} loading={isLoading} disabled={!Number(amount) || reference.trim().length < 4} fullWidth />
        </View>
      ) : d.duesPaise > 0 ? (
        <Text variant="bodySmall" weight="bold" color={zappy[600]} onPress={() => setOpen(true)} accessibilityRole="button">I have paid, tell ZappyOne</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stopped: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  near: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pay: { marginTop: spacing.xs, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: 'rgba(255,255,255,0.7)' },
  form: { gap: spacing.sm, marginTop: spacing.xs },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
});
