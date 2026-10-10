/**
 * What ZappyOne owes the shop, and asking for it (the website's
 * ShopWithdrawPage): earned online, minus what the shop owes from cash jobs,
 * minus payouts already asked for. Paid to a saved bank account or UPI ID,
 * one payout at a time, after a fresh OTP.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, Clock, Landmark, Smartphone, XCircle } from 'lucide-react-native';
import { useGetWorkerBankAccountsQuery, useRequestShopPayoutMutation, useShopPayoutsQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { useOtpGate } from '@zappy/ui/components/common/OtpGate';
import { errText, type ApiErr } from '@zappy/ui/lib/feedback';
import { accent, colors, danger, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const STATUS: Record<string, [string, typeof Clock, string, string]> = {
  requested: ['On its way', Clock, accent[700], accent[50]],
  paid: ['Paid', CheckCircle2, success[700], success[50]],
  rejected: ['Not sent', XCircle, danger[600], danger[50]],
};
interface Dest { key: string; type: 'bank' | 'upi'; id: string; label: string; isDefault?: boolean }
interface Payout { _id: string; status: string; amountPaise: number; createdAt: string; reference?: string; reason?: string; destination?: { label?: string } }

export function ShopWithdrawPage() {
  const router = useRouter();
  const { data, isLoading } = useShopPayoutsQuery();
  const { data: accounts } = useGetWorkerBankAccountsQuery();
  const [request, { isLoading: sending }] = useRequestShopPayoutMutation();
  const otp = useOtpGate();
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState<Dest | null>(null);

  const options: Dest[] = useMemo(() => [
    ...(accounts?.banks || []).map((b: { _id: string; bankName?: string; label?: string; accountNumber: string; isDefault?: boolean }) => ({ key: `bank:${b._id}`, type: 'bank' as const, id: b._id, label: `${b.bankName || b.label || 'Bank'} · ${b.accountNumber}`, isDefault: b.isDefault })),
    ...(accounts?.upiIds || []).map((u: { _id: string; upiId: string; isDefault?: boolean }) => ({ key: `upi:${u._id}`, type: 'upi' as const, id: u._id, label: u.upiId, isDefault: u.isDefault })),
  ], [accounts]);
  useEffect(() => { if (!dest && options.length) setDest(options.find((o) => o.isDefault) || options[0]); }, [options, dest]);

  if (isLoading) return <View style={styles.page}><ScreenHeader title="Withdraw" safeArea /><LoadingState /></View>;
  const b = data || {};
  const paise = Math.round(Number(amount || 0) * 100);
  const history: Payout[] = b.history || [];

  async function submit() {
    if (!dest) { toast.error('Add a bank account or UPI ID first'); return; }
    try {
      const r = (await otp.run(() => request({ amountPaise: paise, type: dest.type, accountId: dest.id }).unwrap())) as { message: string };
      toast.success(r.message);
      setAmount('');
    } catch (err) { if ((err as ApiErr)?.message !== 'cancelled') toast.error(errText(err, 'Could not ask for the payout')); }
  }

  return (
    <View style={styles.page}>
      {otp.modal}
      <ScreenHeader title="Withdraw" safeArea />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text variant="caption" weight="semibold" color={slate[400]}>Available to withdraw</Text>
          <Text variant="display" weight="black" color="#fff">{formatPaise(b.availablePaise)}</Text>
          <View style={styles.split}>
            {([['Earned online', b.earnedPaise, ''], ['Owed from cash jobs', b.owedPaise, '− '], ['Paid out', b.paidOutPaise, '− ']] as [string, number, string][]).map(([label, v, sign]) => (
              <View key={label} style={styles.flex}><Text variant="caption" color={slate[400]}>{label}</Text><Text variant="caption" weight="bold" color="#fff">{sign}{formatPaise(v)}</Text></View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text variant="bodySmall" weight="bold">Ask for a payout</Text>
          {!options.length ? (
            <Pressable onPress={() => router.push('/shop/bank' as never)} accessibilityRole="button" style={styles.dashed}>
              <Text variant="bodySmall" weight="semibold" color={zappy[700]}>Add a bank account or UPI ID first</Text>
            </Pressable>
          ) : (
            <>
              {options.map((o) => (
                <Pressable key={o.key} onPress={() => setDest(o)} accessibilityRole="radio" accessibilityState={{ selected: dest?.key === o.key }} style={[styles.option, dest?.key === o.key && styles.optionOn]}>
                  {o.type === 'bank' ? <Landmark size={16} color={ink[500]} /> : <Smartphone size={16} color={ink[500]} />}
                  <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.flex}>{o.label}</Text>
                </Pressable>
              ))}
              <View style={styles.amount}>
                <Text variant="body" color={ink[400]}>₹</Text>
                <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder={`At least ${formatPaise(b.minPaise)}`} placeholderTextColor={ink[400]} style={styles.amountInput} />
                <Pressable onPress={() => setAmount(String(Math.floor((b.availablePaise || 0) / 100)))} hitSlop={8}><Text variant="caption" weight="bold" color={zappy[600]}>All</Text></Pressable>
              </View>
              <Button label={b.open ? 'A payout is already on its way' : `Withdraw ${paise ? formatPaise(paise) : ''}`} onPress={submit} loading={sending}
                disabled={!!b.open || paise < (b.minPaise || 0) || paise > (b.availablePaise || 0)} fullWidth size="large" />
              <Text variant="caption" color={ink[500]}>Reaches your account within 2 working days. You can have one payout on its way at a time.</Text>
            </>
          )}
        </View>

        {history.length ? (
          <View style={styles.cardFlat}>
            <Text variant="bodySmall" weight="bold" style={styles.histHead}>Payouts</Text>
            {history.map((h) => {
              const [label, Icon, fg, bg] = STATUS[h.status] || STATUS.requested;
              return (
                <View key={h._id} style={styles.hist}>
                  <View style={[styles.pill, { backgroundColor: bg }]}><Icon size={11} color={fg} /><Text variant="caption" weight="bold" color={fg}>{label}</Text></View>
                  <View style={styles.flex}>
                    <Text variant="caption" color={ink[700]} numberOfLines={2}>{[h.destination?.label, h.reference ? `ref ${h.reference}` : '', h.reason].filter(Boolean).join(' · ')}</Text>
                    <Text variant="caption" color={ink[400]}>{new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  </View>
                  <Text variant="bodySmall" weight="bold">{formatPaise(h.amountPaise)}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  hero: { gap: 4, padding: spacing.lg, borderRadius: radius.extraLarge, backgroundColor: ink[900] },
  split: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardFlat: { borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dashed: { alignItems: 'center', padding: spacing.base, borderRadius: radius.medium, borderWidth: 2, borderStyle: 'dashed', borderColor: slate[200] },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.medium, borderWidth: 2, borderColor: slate[200] },
  optionOn: { borderColor: zappy[600], backgroundColor: zappy[50] },
  amount: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border },
  amountInput: { flex: 1, fontSize: 16, fontFamily: 'Figtree-SemiBold', color: ink[900] },
  histHead: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: slate[100] },
  hist: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: slate[100] },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
