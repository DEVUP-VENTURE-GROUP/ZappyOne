/**
 * Hand a job back when the provider cannot finish it (the websites' GiveBackCard).
 */
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Undo2, UserX } from 'lucide-react-native';
import { useJobGiveBackQuery, useGiveBackJobMutation, useReportCustomerAbsentMutation } from '@zappy/core/api';
import { minsUntil } from '@zappy/core/shared/jobFlows';
import { Button, Text } from '../components';
import { toast } from '../components/Toast';
import { JobCard } from '../components/jobs/JobCard';
import { errText } from '../lib/feedback';
import { colors, zappy, ink, slate, accent } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

export function GiveBackCard({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());
  const { data, isFetching } = useJobGiveBackQuery({ id: jobId, reason: reason || 'other', status }, { skip: !jobId });
  const [giveBack, { isLoading: giving }] = useGiveBackJobMutation();
  const [reportAbsent, { isLoading: reporting }] = useReportCustomerAbsentMutation();
  const absent = data?.customerAbsent;
  useEffect(() => {
    if (!absent || absent.open) return undefined;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [absent]);

  if (!data || (!data.canGiveBack && !absent)) return null;
  const quote = data.quote;
  const waitLeft = minsUntil(absent?.opensAt, now);

  async function confirm() {
    if (!reason) { toast.error('Pick a reason first'); return; }
    if (reason === 'other' && note.trim().length < 5) { toast.error('Say in a few words why you cannot do it'); return; }
    try {
      const out = await giveBack({ id: jobId, reason, note: note.trim() }).unwrap();
      toast.success(out.toShop ? 'Sent back to your shop owner' : 'Handed back. We are finding someone else.');
      router.replace('/worker/work' as never);
    } catch (err) { toast.error(errText(err, 'Could not hand this job back')); }
  }

  function customerAbsent() {
    Alert.alert('Customer not here?', 'Close this job because the customer is not here? They are charged for the missed visit.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close the job', style: 'destructive', onPress: async () => {
        try {
          const out = await reportAbsent(jobId).unwrap();
          toast.success(out.message || 'Closed');
          router.replace('/worker/work' as never);
        } catch (err) { toast.error(errText(err, 'Could not close the job')); }
      } },
    ]);
  }

  return (
    <JobCard>
      {absent ? (
        <Button
          variant="outline"
          icon={<UserX size={15} color={ink[700]} />}
          label={absent.open || waitLeft === 0 ? 'Customer not here? Close the job' : `Customer not here? Available in ${waitLeft} min. Call them first.`}
          onPress={customerAbsent}
          disabled={(!absent.open && waitLeft > 0) || reporting}
          loading={reporting}
          fullWidth
        />
      ) : null}
      {data.canGiveBack && !open ? (
        <Pressable onPress={() => setOpen(true)} style={styles.inlineCenter} hitSlop={6}>
          <Undo2 size={15} color={ink[500]} /><Text variant="bodySmall" weight="semibold" color={ink[500]}>Can't do this job? Hand it back</Text>
        </Pressable>
      ) : null}
      {data.canGiveBack && open && quote ? (
        <View style={styles.gap}>
          <Text variant="bodySmall" weight="bold">Why can't you do it?</Text>
          <View style={styles.wrap}>
            {quote.reasons.map((r: { code: string; label: string }) => (
              <Pressable key={r.code} onPress={() => setReason(r.code)} accessibilityRole="radio" accessibilityState={{ selected: reason === r.code }}
                style={[styles.chip, reason === r.code && styles.chipOn]}>
                <Text variant="caption" weight="semibold" color={reason === r.code ? zappy[700] : ink[700]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          {reason === 'other' ? <TextInput value={note} onChangeText={setNote} maxLength={300} multiline placeholder="What happened?" placeholderTextColor={ink[400]} style={styles.textArea} /> : null}
          {reason ? (
            <View style={[styles.note, { backgroundColor: quote.penaltyPaise > 0 || quote.pauses ? accent[50] : slate[50] }]}>
              <Text variant="caption" color={quote.penaltyPaise > 0 || quote.pauses ? accent[700] : ink[700]}>{isFetching ? 'Checking…' : quote.message}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Button label="Keep the job" variant="outline" onPress={() => { setOpen(false); setReason(''); setNote(''); }} style={styles.flex} />
            <Button label="Hand it back" variant="danger" onPress={confirm} loading={giving} disabled={!reason || giving || isFetching} style={styles.flex} />
          </View>
        </View>
      ) : null}
    </JobCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gap: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inlineCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 36, backgroundColor: colors.surface },
  chipOn: { borderColor: zappy[600], backgroundColor: zappy[50] },
  textArea: { minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], textAlignVertical: 'top' },
  note: { borderRadius: radius.button, padding: spacing.md },
});
