/**
 * Withdraw from the wallet to a saved bank account or UPI ID (the websites'
 * WorkerWithdrawPage). Dues from cash jobs come first; payouts need a fresh OTP.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AlertCircle, Banknote, Building2, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useGetWorkerBankAccountsQuery, useGetWalletQuery, useRequestPayoutMutation } from '@zappy/core/api';
import { Button, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { FieldLabel } from '../../components/common/FormField';
import { useOtpGate } from '../../components/common/OtpGate';
import { type ApiErr, errText } from '../../lib/feedback';
import { colors, zappy, ink, slate, success, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { DuesCard } from '../DuesCard';
import type { Bank, Upi } from './WorkerBankPage';

const MIN_PAISE = 5000;    // ₹50, must match server payout.service.js

const MAX_PAISE = 2500000; // ₹25,000

/*
 * No speed or fee choice: payouts are reviewed and transferred by the team
 * until a payout gateway is connected (as on the website). It returns with it.
 */
export function WorkerWithdrawPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: walletData, isLoading: walletLoading } = useGetWalletQuery();
  const { data: bankData, isLoading: bankLoading } = useGetWorkerBankAccountsQuery();
  const [requestPayout, { isLoading: submitting }] = useRequestPayoutMutation();
  const otp = useOtpGate();
  const [amountRs, setAmountRs] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const balancePaise: number = walletData?.balance ?? 0;
  const banks: Bank[] = bankData?.banks ?? [];
  const upiIds: Upi[] = bankData?.upiIds ?? [];
  const methods = [
    ...banks.map((b) => ({ id: b._id, type: 'bank' as const, label: b.label || b.bankName || 'Bank account', sub: b.accountNumber, isDefault: b.isDefault, accountName: b.accountName, ifsc: b.ifsc })),
    ...upiIds.map((u) => ({ id: u._id, type: 'upi' as const, label: u.label || 'UPI', sub: u.upiId, isDefault: u.isDefault, accountName: '', ifsc: '' })),
  ];
  const selected = methods.find((m) => m.id === selectedId) ?? methods.find((m) => m.isDefault) ?? methods[0];

  const amtRs = parseFloat(amountRs) || 0;
  const netRs = amtRs;
  const amtPaise = Math.round(amtRs * 100);
  const validationError = amtPaise < MIN_PAISE && amtRs > 0 ? `Minimum withdrawal is ₹${MIN_PAISE / 100}`
    : amtPaise > MAX_PAISE ? `Maximum withdrawal is ₹${MAX_PAISE / 100}`
    : amtPaise > balancePaise ? 'Insufficient wallet balance'
    : !selected ? 'Add a bank account or UPI ID first' : null;

  async function submit() {
    if (validationError) { toast.error(validationError); return; }
    if (!amtRs || !selected) { toast.error('Enter an amount'); return; }
    const body: Record<string, unknown> = { amountPaise: amtPaise, method: selected.type };
    if (selected.type === 'upi') body.upiId = selected.sub;
    else { body.bankAccount = selected.sub; body.bankIfsc = selected.ifsc ?? ''; body.accountName = selected.accountName ?? ''; }
    try {
      await otp.run(() => requestPayout(body).unwrap());
      toast.success('Withdrawal requested');
      router.replace('/worker' as never);
    } catch (err) { if ((err as ApiErr)?.message !== 'cancelled') toast.error(errText(err, 'Failed to request withdrawal. Try again.')); }
  }

  return (
    <View style={styles.page}>
      {otp.modal}
      <ScreenHeader title="Withdraw funds" safeArea />
      {walletLoading || bankLoading ? <LoadingState /> : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, styles.centerCol, { backgroundColor: ink[900], borderColor: ink[900] }]}>
            <Text variant="caption" weight="bold" color={slate[400]}>AVAILABLE BALANCE</Text>
            <Text variant="display" weight="black" color="#fff">₹{(balancePaise / 100).toFixed(2)}</Text>
            {balancePaise < MIN_PAISE ? <View style={[styles.tag, { backgroundColor: 'rgba(245,158,11,0.2)' }]}><AlertCircle size={12} color={'#FCD34D'} /><Text variant="caption" weight="bold" color={'#FCD34D'}>Min. withdrawal ₹{MIN_PAISE / 100}</Text></View> : null}
          </View>

          {/* Owing from cash jobs comes first: only what is left over can be withdrawn. */}
          <DuesCard />

          <View style={styles.card}>
            <View style={styles.between}>
              <FieldLabel>AMOUNT TO WITHDRAW</FieldLabel>
              <Pressable onPress={() => setAmountRs(String(Math.min(Math.floor(balancePaise / 100), MAX_PAISE / 100)))} hitSlop={6}><Text variant="caption" weight="bold" color={zappy[600]}>USE MAX</Text></Pressable>
            </View>
            <View style={[styles.amountBox, validationError && amtRs > 0 ? { borderColor: danger[400], backgroundColor: danger[50] } : null]}>
              <Text variant="heading1" weight="black" color={amtRs ? zappy[600] : ink[300]}>₹</Text>
              <TextInput value={amountRs} onChangeText={(v) => setAmountRs(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={ink[300]}
                style={[styles.amountInput, validationError && amtRs > 0 ? { color: danger[600] } : null]} accessibilityLabel="Amount in rupees" />
            </View>
            {validationError && amtRs > 0 ? <View style={styles.row}><AlertCircle size={12} color={danger[500]} /><Text variant="caption" weight="bold" color={danger[500]}>{validationError}</Text></View> : null}
            <View style={styles.row}>
              {[500, 1000, 2000, 5000].map((v) => (
                <Pressable key={v} onPress={() => setAmountRs(String(v))} style={[styles.preset, styles.flex]}><Text variant="caption" weight="bold" color={ink[700]}>₹{v}</Text></Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.between}>
              <FieldLabel>SEND TO</FieldLabel>
              <Pressable onPress={() => router.push('/worker/bank' as never)} hitSlop={6}><Text variant="caption" weight="bold" color={zappy[600]}>+ ADD NEW</Text></Pressable>
            </View>
            {methods.length === 0 ? (
              <Pressable onPress={() => router.push('/worker/bank' as never)} style={styles.dashed}>
                <Banknote size={22} color={zappy[500]} />
                <Text variant="bodySmall" weight="bold" color={zappy[600]}>Add bank account or UPI</Text>
                <Text variant="caption" color={zappy[400]}>Required to withdraw</Text>
              </Pressable>
            ) : methods.map((m) => {
              const on = selected?.id === m.id;
              return (
                <Pressable key={m.id} onPress={() => setSelectedId(m.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.option, on && styles.optionOn]}>
                  <View style={[styles.iconBox, on && { backgroundColor: zappy[600] }]}>{m.type === 'upi' ? <Smartphone size={18} color={on ? '#fff' : ink[500]} /> : <Building2 size={18} color={on ? '#fff' : ink[500]} />}</View>
                  <View style={styles.flex}>
                    <Text variant="bodySmall" weight="black" numberOfLines={1}>{m.label}</Text>
                    <Text variant="caption" color={ink[400]} numberOfLines={1}>{m.type === 'bank' ? `•••• ${m.sub.slice(-4)}` : m.sub}</Text>
                  </View>
                  {m.isDefault && !on ? <View style={styles.tag}><Text variant="caption" weight="bold" color={ink[500]}>Default</Text></View> : null}
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                </Pressable>
              );
            })}
          </View>

          {amtRs > 0 && !validationError ? (
            <View style={[styles.card, { backgroundColor: ink[900], borderColor: ink[900] }]}>
              <View style={styles.between}><Text variant="bodySmall" color={slate[400]}>Withdrawal amount</Text><Text variant="bodySmall" weight="bold" color="#fff">₹{amtRs.toFixed(2)}</Text></View>
              <View style={[styles.between, styles.topRule]}><Text variant="body" weight="black" color="#fff">You receive</Text><Text variant="heading2" weight="black" color={'#86EFAC'}>₹{netRs.toFixed(2)}</Text></View>
            </View>
          ) : null}

          <View style={[styles.row, styles.sunken, { alignItems: 'flex-start' }]}>
            <ShieldCheck size={16} color={success[500]} />
            <Text variant="caption" color={ink[500]} style={styles.flex}>All withdrawals are securely processed. We review each one and send it to the account you chose.</Text>
          </View>
        </ScrollView>
      )}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label={submitting ? 'Processing request…' : `Withdraw ₹${netRs > 0 ? netRs.toFixed(2) : '0.00'}`} onPress={submit} loading={submitting}
          disabled={!!validationError || !amtRs || methods.length === 0 || balancePaise < MIN_PAISE} fullWidth size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  centerCol: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 140 },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  sunken: { backgroundColor: slate[50], borderRadius: radius.medium, padding: spacing.md, borderWidth: 1, borderColor: slate[100] },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: slate[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  iconBox: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  dashed: { borderWidth: 2, borderStyle: 'dashed', borderColor: slate[200], borderRadius: radius.large, padding: spacing.xl, alignItems: 'center', gap: 4, backgroundColor: colors.surface },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 2, borderColor: slate[100], borderRadius: radius.large, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  amountInput: { flex: 1, fontSize: 34, fontFamily: 'Figtree-Black', color: ink[900], paddingVertical: 4 },
  preset: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: slate[50] },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 2, borderColor: slate[100], borderRadius: radius.large, padding: spacing.md, backgroundColor: colors.surface },
  optionOn: { borderColor: zappy[500], backgroundColor: zappy[50] },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: slate[300], alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: zappy[600], backgroundColor: zappy[600] },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.base, paddingTop: spacing.md },
  topRule: { borderTopWidth: 1, borderTopColor: ink[700], paddingTop: spacing.sm },
});
