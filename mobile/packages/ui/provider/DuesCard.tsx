/**
 * Cash the provider collected that is owed to ZappyOne (the websites' DuesCard):
 * how much, by when, and telling us it was paid.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AlertTriangle, ChevronDown, Wallet } from 'lucide-react-native';
import { useWorkerDuesQuery, useClaimDuesPaymentMutation } from '@zappy/core/api';
import { duesView, duesClaimError } from '@zappy/core/shared/workerHome';
import { Button, Text } from '../components';
import { toast } from '../components/Toast';
import { colors, zappy, ink, slate, success, accent, danger } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { errText } from '../lib/feedback';

const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

const DUES_TONE: Record<string, { bg: string; border: string; icon: string; iconBg: string; bar: string }> = {
  in_debt: { bg: colors.surface, border: colors.border, icon: ink[700], iconBg: slate[100], bar: ink[500] },
  warning: { bg: accent[50], border: accent[100], icon: accent[700], iconBg: accent[100], bar: accent[500] },
  blocked: { bg: danger[50], border: danger[100], icon: danger[600], iconBg: danger[100], bar: danger[500] },
};

export function DuesCard({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useWorkerDuesQuery(undefined, { pollingInterval: 120000 });
  const [claim, { isLoading: sending }] = useClaimDuesPaymentMutation();
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'upi' | 'bank' | 'cash'>('upi');
  const [reference, setReference] = useState('');

  const view = duesView(data?.dues);
  if (isLoading || !view) return null;
  const t = DUES_TONE[view.status] || DUES_TONE.in_debt;

  async function submit() {
    const problem = duesClaimError({ amount, method, reference });
    if (problem) { toast.error(problem); return; }
    try {
      await claim({ amountPaise: Math.round(Number(amount) * 100), method, reference: reference.trim() }).unwrap();
      toast.success('Thanks. We will confirm it once we see the payment.');
      setPaying(false); setAmount(''); setReference('');
    } catch (err) {
      toast.error(errText(err, 'Could not send that. Try again.'));
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={styles.rowTop}>
        <View style={[styles.iconBox, { backgroundColor: t.iconBg }]}>
          {view.status === 'in_debt' ? <Wallet size={18} color={t.icon} /> : <AlertTriangle size={18} color={t.icon} />}
        </View>
        <View style={styles.flex}>
          <Text variant="body" weight="bold">{view.title}</Text>
          {view.owes ? <Text variant="bodySmall" color={ink[700]} style={styles.mtXs}>{view.body}</Text> : null}
          {view.owes ? (
            <View style={styles.mtSm}>
              <View style={styles.barBg}><View style={[styles.bar, { width: `${Math.max(4, view.used)}%`, backgroundColor: t.bar }]} /></View>
              <View style={styles.between}>
                <Text variant="caption" color={colors.textSecondary}>{view.owedLabel} owed</Text>
                <Text variant="caption" color={colors.textSecondary}>limit {view.limitLabel}</Text>
              </View>
            </View>
          ) : null}
          {view.waiting.length ? <Text variant="caption" color={ink[700]} style={styles.mtSm}>Waiting to confirm: {view.waiting.join(', ')}</Text> : null}
        </View>
      </View>

      {!compact && view.owes ? (
        <>
          {view.payInstructions ? (
            <View style={styles.howTo}>
              <Text variant="bodySmall" color={ink[700]}><Text variant="bodySmall" weight="bold">How to pay: </Text>{view.payInstructions}</Text>
            </View>
          ) : null}
          {paying ? (
            <View style={styles.form}>
              <Text variant="bodySmall" weight="semibold">Tell us what you paid</Text>
              <View style={styles.methods}>
                {([['upi', 'UPI'], ['bank', 'Bank'], ['cash', 'Cash at office']] as const).map(([v, l]) => (
                  <Pressable key={v} onPress={() => setMethod(v)} accessibilityRole="radio" accessibilityState={{ selected: method === v }}
                    style={[styles.method, method === v && styles.methodOn]}>
                    <Text variant="caption" weight="semibold" color={method === v ? zappy[700] : ink[700]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.inputRow}>
                <Text variant="body" color={ink[400]}>₹</Text>
                <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad"
                  placeholder="Amount" placeholderTextColor={ink[400]} style={styles.input} accessibilityLabel="Amount paid in rupees" />
              </View>
              {method !== 'cash' ? (
                <TextInput value={reference} onChangeText={setReference} maxLength={80} placeholder="UPI / bank reference number"
                  placeholderTextColor={ink[400]} style={[styles.input, styles.inputBox]} accessibilityLabel="UPI or bank reference number" />
              ) : null}
              <View style={styles.methods}>
                <Button label="Back" variant="outline" onPress={() => setPaying(false)} style={styles.flex} />
                <Button label="Send" onPress={submit} loading={sending} style={styles.flex} />
              </View>
            </View>
          ) : (
            <View style={[styles.methods, styles.mtMd]}>
              <Button label="I have paid" onPress={() => setPaying(true)} style={styles.flex} />
              <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.whatBtn}>
                <Text variant="bodySmall" weight="semibold">What is this</Text>
                <ChevronDown size={14} color={ink[700]} style={open ? styles.flip : undefined} />
              </Pressable>
            </View>
          )}
          {open ? (
            <View style={styles.recent}>
              {view.recent.map((r: { _id: string; description?: string; reason: string; amountPaise: number }) => (
                <View key={r._id} style={styles.recentRow}>
                  <Text variant="caption" color={ink[700]} numberOfLines={1} style={styles.flex}>{r.description || r.reason.replace(/_/g, ' ')}</Text>
                  <Text variant="caption" weight="semibold" color={r.amountPaise < 0 ? danger[600] : success[700]}>
                    {r.amountPaise < 0 ? '−' : '+'}{rupees(Math.abs(r.amountPaise))}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  between: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  mtXs: { marginTop: 2 },
  mtSm: { marginTop: spacing.sm },
  mtMd: { marginTop: spacing.md },
  flip: { transform: [{ rotate: '180deg' }] },
  card: { borderRadius: radius.medium, borderWidth: 1, padding: spacing.base },
  iconBox: { width: 36, height: 36, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  barBg: { height: 8, borderRadius: radius.pill, backgroundColor: slate[200] },
  bar: { height: 8, borderRadius: radius.pill },
  howTo: { marginTop: spacing.md, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: radius.button, padding: spacing.md, borderWidth: 1, borderColor: slate[100] },
  form: { marginTop: spacing.md, gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.button, padding: spacing.md, borderWidth: 1, borderColor: slate[100] },
  methods: { flexDirection: 'row', gap: spacing.sm },
  method: { flex: 1, alignItems: 'center', borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, minHeight: 40, justifyContent: 'center' },
  methodOn: { borderColor: zappy[600], backgroundColor: zappy[50] },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  input: { flex: 1, minHeight: 44, fontSize: 15, color: ink[900], fontFamily: 'Figtree-Regular' },
  inputBox: { borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  whatBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 48 },
  recent: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.button, borderWidth: 1, borderColor: slate[100] },
  recentRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: slate[100] },
});
