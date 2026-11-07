/**
 * Where earnings are paid: bank accounts and UPI IDs (the websites' WorkerBankPage).
 * Adding one needs a fresh OTP, asked for only when the server wants it.
 */
import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AlertCircle, Building2, CheckCircle2, Plus, ShieldCheck, Smartphone, Star, Trash2 } from 'lucide-react-native';
import {
  useGetWorkerBankAccountsQuery,
  useAddWorkerBankAccountMutation,
  useCheckUpiIdMutation,
  useDeleteWorkerBankAccountMutation,
  useSetDefaultWorkerBankAccountMutation,
} from '@zappy/core/api';
import { Button, EmptyState, ErrorState, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { FieldLabel, FormField } from '../../components/common/FormField';
import { FullScreenSheet } from '../../components/common/FullScreenSheet';
import { useOtpGate } from '../../components/common/OtpGate';
import { bankFormErrors } from '@zappy/core/shared/bankRules';
import { type ApiErr, errText } from '../../lib/feedback';
import { colors, zappy, ink, slate, success, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

function AddMethodSheet({ onClose, start = 'bank' }: { onClose: () => void; start?: 'bank' | 'upi' }) {
  const [tab, setTab] = useState<'bank' | 'upi'>(start);
  const [form, setForm] = useState({ label: '', accountName: '', accountNumber: '', bankName: '', ifsc: '', upiId: '', upiLabel: '' });
  const [add, { isLoading: saving }] = useAddWorkerBankAccountMutation();
  const [checkUpi, { isLoading: checking }] = useCheckUpiIdMutation();
  // The name a UPI ID is under, shown to confirm before saving (null until checked).
  const [upiName, setUpiName] = useState<string | null>(null);
  const isLoading = saving || checking;
  const otp = useOtpGate();
  const set = (k: keyof typeof form, v: string) => { setForm((f) => ({ ...f, [k]: v })); if (k === 'upiId') setUpiName(null); };
  // Shown once save is tapped, then kept current as each field is fixed.
  const [tried, setTried] = useState(false);
  const errors = (tried ? bankFormErrors(tab, form) : {}) as Record<string, string | undefined>;

  async function submit() {
    setTried(true);
    if (Object.keys(bankFormErrors(tab, form)).length) return;
    if (tab === 'upi' && upiName === null) {
      try {
        const r = await checkUpi(form.upiId.trim()).unwrap();
        if (r.status === 'invalid') { toast.error('This UPI ID does not exist. Check it in your UPI app.'); return; }
        // Verified: show whose it is and wait for "Yes, save". Could not check: save as it is.
        if (r.status === 'verified' && r.name) { setUpiName(r.name); return; }
      } catch { /* checking is a help, never a blocker: the server checks again when saving */ }
    }
    try {
      // Only this tab's fields: the other tab's empty ones are not part of what is saved.
      const body = tab === 'upi' ? { type: 'upi', upiId: form.upiId.trim(), upiLabel: form.upiLabel.trim() } : { type: 'bank', label: form.label.trim(), accountName: form.accountName.trim(), accountNumber: form.accountNumber.replace(/\s/g, ''), bankName: form.bankName.trim(), ifsc: form.ifsc.trim().toUpperCase() };
      await otp.run(() => add(body).unwrap());
      toast.success(tab === 'upi' ? 'UPI ID added' : 'Bank account added');
      onClose();
    } catch (err) { if ((err as ApiErr)?.message !== 'cancelled') toast.error(errText(err, 'Failed to add payment method')); }
  }

  return (
    <FullScreenSheet title="Add destination" onClose={onClose}>
      {otp.modal}
      <View style={styles.segment}>
        {(['bank', 'upi'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} style={[styles.segmentBtn, tab === t && styles.segmentOn]}>
            {t === 'bank' ? <Building2 size={16} color={tab === t ? zappy[600] : ink[500]} /> : <Smartphone size={16} color={tab === t ? zappy[600] : ink[500]} />}
            <Text variant="bodySmall" weight="bold" color={tab === t ? zappy[600] : ink[500]}>{t === 'bank' ? 'Bank transfer' : 'UPI ID'}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'bank' ? (
        <>
          <FormField label="ACCOUNT HOLDER" placeholder="Name as per bank record" value={form.accountName} onChangeText={(v) => set('accountName', v)} error={errors.accountName} />
          <FormField label="ACCOUNT NUMBER" placeholder="0000 0000 0000" keyboardType="number-pad" value={form.accountNumber} onChangeText={(v) => set('accountNumber', v.replace(/\D/g, ''))} error={errors.accountNumber} />
          <FormField label="IFSC CODE" placeholder="SBIN0001234" autoCapitalize="characters" maxLength={11} value={form.ifsc} onChangeText={(v) => set('ifsc', v.toUpperCase())} error={errors.ifsc} />
          <FormField label="BANK NAME" placeholder="e.g. State Bank" value={form.bankName} onChangeText={(v) => set('bankName', v)} />
          <FormField label="NICKNAME (OPTIONAL)" placeholder="e.g. Main salary account" value={form.label} onChangeText={(v) => set('label', v)} />
        </>
      ) : (
        <>
          <FormField label="UPI ID" placeholder="username@bank" autoCapitalize="none" keyboardType="email-address" value={form.upiId} onChangeText={(v) => set('upiId', v.trim())} error={errors.upiId} />
          {upiName ? (
            <View style={styles.verified}>
              <CheckCircle2 size={16} color={success[600]} />
              <Text variant="bodySmall" color={success[700]} style={styles.flex}>Payments to this UPI ID go to <Text variant="bodySmall" weight="bold" color={success[700]}>{upiName}</Text>. Is this you?</Text>
            </View>
          ) : null}
          <FormField label="NICKNAME (OPTIONAL)" placeholder="e.g. PhonePe / GPay" value={form.upiLabel} onChangeText={(v) => set('upiLabel', v)} />
        </>
      )}
      <Button label={tab === 'upi' && upiName ? 'Yes, save this UPI ID' : tab === 'upi' ? 'Check and save' : 'Save securely'} onPress={submit} loading={isLoading} fullWidth size="large" />
      <View style={[styles.row, { justifyContent: 'center' }]}><ShieldCheck size={12} color={success[500]} /><Text variant="caption" color={ink[400]}>Information is securely encrypted</Text></View>
    </FullScreenSheet>
  );
}

export type Bank = { _id: string; bankName?: string; accountName: string; accountNumber: string; ifsc: string; label?: string; isDefault?: boolean };

export type Upi = { _id: string; upiId: string; label?: string; isDefault?: boolean; verifiedName?: string };

export function WorkerBankPage() {
  const { data, isLoading, isError, refetch } = useGetWorkerBankAccountsQuery();
  const [deleteAcc] = useDeleteWorkerBankAccountMutation();
  const [setDefault] = useSetDefaultWorkerBankAccountMutation();
  // From the setup list's UPI step (?focus=upi): open straight on Add UPI ID.
  const upiFirst = useLocalSearchParams<{ focus?: string }>().focus === 'upi';
  const [showAdd, setShowAdd] = useState(upiFirst);
  const banks: Bank[] = data?.banks ?? [];
  const upiIds: Upi[] = data?.upiIds ?? [];

  function remove(id: string, type: 'bank' | 'upi') {
    Alert.alert('Remove this payment method?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deleteAcc({ id, type }).unwrap(); toast.success('Removed'); } catch { toast.error('Failed to remove'); }
      } },
    ]);
  }
  async function makeDefault(id: string, type: 'bank' | 'upi') {
    try { await setDefault({ id, type }).unwrap(); toast.success('Set as default'); } catch { toast.error('Failed'); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="Bank & UPI" safeArea right={<Button label="Add" size="small" icon={<Plus size={14} color="#fff" />} onPress={() => setShowAdd(true)} />} />
      {isLoading ? <LoadingState /> : isError ? <ErrorState title="This did not load" message="Check your internet and try again." onRetry={refetch} /> : (
        <ScrollView contentContainerStyle={styles.body}>
          {banks.length === 0 && upiIds.length === 0 ? (
            <EmptyState title="No payment methods" message="Add a bank account or UPI ID to withdraw your earnings securely." actionLabel="Add method now" onAction={() => setShowAdd(true)}
              icon={<ShieldCheck size={26} color={zappy[400]} />} />
          ) : null}
          {banks.length ? <FieldLabel>BANK ACCOUNTS</FieldLabel> : null}
          {banks.map((b) => (
            <View key={b._id} style={[styles.card, b.isDefault && styles.defaultCard]}>
              <View style={styles.between}>
                <View style={styles.flex}>
                  <Text variant="caption" weight="bold" color={ink[400]}>{(b.bankName || 'Bank account').toUpperCase()}</Text>
                  <Text variant="body" weight="black">{b.accountName}</Text>
                </View>
                {b.isDefault ? <View style={[styles.tag, { backgroundColor: zappy[500] }]}><CheckCircle2 size={10} color="#fff" /><Text variant="caption" weight="black" color="#fff">Default</Text></View> : null}
              </View>
              <View style={[styles.between, styles.sunken]}>
                <View><Text variant="caption" weight="bold" color={ink[400]}>A/C NUMBER</Text><Text variant="bodySmall" weight="bold">•••• {b.accountNumber.slice(-4)}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text variant="caption" weight="bold" color={ink[400]}>IFSC</Text><Text variant="bodySmall" weight="bold">{b.ifsc}</Text></View>
              </View>
              <View style={styles.between}>
                <View style={styles.tag}><Text variant="caption" weight="bold" color={ink[500]}>{b.label || 'Saved'}</Text></View>
                <View style={styles.row}>
                  {!b.isDefault ? <Button label="Make default" size="small" variant="outline" onPress={() => makeDefault(b._id, 'bank')} /> : null}
                  <Pressable onPress={() => remove(b._id, 'bank')} accessibilityLabel="Remove bank account" hitSlop={6} style={[styles.iconBtn, { backgroundColor: danger[50] }]}><Trash2 size={14} color={danger[500]} /></Pressable>
                </View>
              </View>
            </View>
          ))}
          {upiIds.length ? <FieldLabel>UPI IDS</FieldLabel> : null}
          {upiIds.map((u) => (
            <View key={u._id} style={[styles.card, styles.row, u.isDefault && styles.defaultCard]}>
              <View style={[styles.iconBox]}><Smartphone size={20} color={zappy[500]} /></View>
              <View style={styles.flex}>
                <Text variant="body" weight="black">{u.upiId}</Text>
                {u.verifiedName ? <View style={styles.row}><CheckCircle2 size={12} color={success[600]} /><Text variant="caption" weight="semibold" color={success[700]}>Verified: {u.verifiedName}</Text></View> : null}
                <View style={styles.row}>
                  <View style={styles.tag}><Text variant="caption" weight="bold" color={ink[500]}>{u.label || 'Saved'}</Text></View>
                  {u.isDefault ? <Text variant="caption" weight="bold" color={zappy[600]}>Default</Text> : null}
                </View>
              </View>
              {!u.isDefault ? <Pressable onPress={() => makeDefault(u._id, 'upi')} accessibilityLabel="Make default" hitSlop={6} style={[styles.iconBtn, { backgroundColor: zappy[50] }]}><Star size={14} color={zappy[600]} fill={zappy[600]} /></Pressable> : null}
              <Pressable onPress={() => remove(u._id, 'upi')} accessibilityLabel="Remove UPI ID" hitSlop={6} style={[styles.iconBtn, { backgroundColor: danger[50] }]}><Trash2 size={14} color={danger[500]} /></Pressable>
            </View>
          ))}
          {banks.length || upiIds.length ? (
            <View style={[styles.card, styles.row, { backgroundColor: success[50], borderColor: success[100] }]}>
              <AlertCircle size={16} color={success[600]} />
              <Text variant="caption" color={success[700]} style={styles.flex}>Your default account will be pre-filled when you request a withdrawal from your wallet.</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
      {showAdd ? <AddMethodSheet start={upiFirst ? 'upi' : 'bank'} onClose={() => setShowAdd(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 140 },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  defaultCard: { borderColor: zappy[500], borderWidth: 2 },
  sunken: { backgroundColor: slate[50], borderRadius: radius.medium, padding: spacing.md, borderWidth: 1, borderColor: slate[100] },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: slate[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  iconBtn: { width: 32, height: 32, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  verified: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radius.large, borderWidth: 1, borderColor: success[100], backgroundColor: success[50] },
  iconBox: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  segment: { flexDirection: 'row', gap: 6, backgroundColor: slate[100], borderRadius: radius.large, padding: 6 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.medium },
  segmentOn: { backgroundColor: colors.surface },
});
