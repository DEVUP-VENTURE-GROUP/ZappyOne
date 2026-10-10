/**
 * Where earnings are paid: bank accounts and UPI IDs (the websites' WorkerBankPage).
 * Adding one needs a fresh OTP, asked for only when the server wants it.
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AlertCircle, Building2, CheckCircle2, Plus, ShieldCheck, Smartphone, Star, Trash2 } from 'lucide-react-native';
import {
  useGetWorkerBankAccountsQuery,
  useAddWorkerBankAccountMutation,
  useDeleteWorkerBankAccountMutation,
  useSetDefaultWorkerBankAccountMutation,
} from '@zappy/core/api';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { FieldLabel, FormField } from '../../components/common/FormField';
import { FullScreenSheet } from '../../components/common/FullScreenSheet';
import { useOtpGate } from '../../components/common/OtpGate';
import { type ApiErr, errText } from '../../lib/feedback';
import { colors, zappy, ink, slate, success, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

function AddMethodSheet({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'bank' | 'upi'>('bank');
  const [form, setForm] = useState({ label: '', accountName: '', accountNumber: '', bankName: '', ifsc: '', upiId: '', upiLabel: '' });
  const [add, { isLoading }] = useAddWorkerBankAccountMutation();
  const otp = useOtpGate();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ready = tab === 'upi' ? form.upiId.trim() : form.accountName.trim() && form.accountNumber.trim() && form.ifsc.trim();

  async function submit() {
    if (!ready) { toast.error('Fill in the required details'); return; }
    try {
      await otp.run(() => add({ type: tab, ...form }).unwrap());
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
          <FormField label="ACCOUNT HOLDER" placeholder="Name as per bank record" value={form.accountName} onChangeText={(v) => set('accountName', v)} />
          <FormField label="ACCOUNT NUMBER" placeholder="0000 0000 0000" keyboardType="number-pad" value={form.accountNumber} onChangeText={(v) => set('accountNumber', v.replace(/\D/g, ''))} />
          <FormField label="IFSC CODE" placeholder="SBIN0001234" autoCapitalize="characters" maxLength={11} value={form.ifsc} onChangeText={(v) => set('ifsc', v.toUpperCase())} />
          <FormField label="BANK NAME" placeholder="e.g. State Bank" value={form.bankName} onChangeText={(v) => set('bankName', v)} />
          <FormField label="NICKNAME (OPTIONAL)" placeholder="e.g. Main salary account" value={form.label} onChangeText={(v) => set('label', v)} />
        </>
      ) : (
        <>
          <FormField label="UPI ID" placeholder="username@bank" autoCapitalize="none" keyboardType="email-address" value={form.upiId} onChangeText={(v) => set('upiId', v.trim())} />
          <FormField label="NICKNAME (OPTIONAL)" placeholder="e.g. PhonePe / GPay" value={form.upiLabel} onChangeText={(v) => set('upiLabel', v)} />
        </>
      )}
      <Button label="Save securely" onPress={submit} loading={isLoading} disabled={!ready} fullWidth size="large" />
      <View style={[styles.row, { justifyContent: 'center' }]}><ShieldCheck size={12} color={success[500]} /><Text variant="caption" color={ink[400]}>Information is securely encrypted</Text></View>
    </FullScreenSheet>
  );
}

export type Bank = { _id: string; bankName?: string; accountName: string; accountNumber: string; ifsc: string; label?: string; isDefault?: boolean };

export type Upi = { _id: string; upiId: string; label?: string; isDefault?: boolean };

export function WorkerBankPage() {
  const { data, isLoading } = useGetWorkerBankAccountsQuery();
  const [deleteAcc] = useDeleteWorkerBankAccountMutation();
  const [setDefault] = useSetDefaultWorkerBankAccountMutation();
  const [showAdd, setShowAdd] = useState(false);
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
      {isLoading ? <LoadingState /> : (
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
      {showAdd ? <AddMethodSheet onClose={() => setShowAdd(false)} /> : null}
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
  iconBox: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  segment: { flexDirection: 'row', gap: 6, backgroundColor: slate[100], borderRadius: radius.large, padding: 6 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.medium },
  segmentOn: { backgroundColor: colors.surface },
});
