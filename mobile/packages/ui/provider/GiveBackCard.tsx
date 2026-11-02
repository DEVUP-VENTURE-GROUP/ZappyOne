/**
 * Hand a job back when the provider cannot finish it (the websites' GiveBackCard).
 */
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock, ShieldCheck, Undo2, UserX } from 'lucide-react-native';
import { useJobGiveBackQuery, useGiveBackJobMutation, useReportCustomerAbsentMutation, useConfirmJobSafeMutation, useAskJobMoreTimeMutation } from '@zappy/core/api';
import { minsUntil } from '@zappy/core/shared/jobFlows';
import { Button, Text } from '../components';
import { toast } from '../components/Toast';
import { JobCard } from '../components/jobs/JobCard';
import { errText } from '../lib/feedback';
import { colors, zappy, ink, slate, accent } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

// "Are you OK?" after a long time at the customer (server: jobs/safety-check); unanswered, ops is alerted.
function SafetyCheck({ jobId, safety, onDone }: { jobId: string; safety?: { asked?: boolean; escalated?: boolean } | null; onDone: () => void }) {
  const [confirmSafe, { isLoading }] = useConfirmJobSafeMutation();
  if (!safety?.asked) return null;
  async function safe() {
    try { toast.success((await confirmSafe(jobId).unwrap()).message); onDone(); }
    catch (err) { toast.error(errText(err, 'Could not send. Try again.')); }
  }
  return (
    <View accessibilityRole="alert" style={styles.safety}>
      <Text variant="bodySmall" weight="bold" color={accent[700]}>Are you OK?</Text>
      <Text variant="caption" color={accent[700]}>{safety.escalated ? 'ZappyOne is calling you. Tap below if you are fine.' : 'You have been at the customer for a while. Tap below, or use SOS if you need help.'}</Text>
      <Button label="I'm safe" icon={<ShieldCheck size={15} color={colors.surface} />} onPress={safe} loading={isLoading} fullWidth />
    </View>
  );
}

interface More { canAsk?: boolean; until?: string; minutes?: number[]; reasons?: { code: string; label: string }[] }
const clock = (d: string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// "This needs longer": pick how long and why; the customer is told the new finish time (server: jobs/more-time).
function MoreTime({ jobId, more, onDone }: { jobId: string; more?: More | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [ask, { isLoading }] = useAskJobMoreTimeMutation();
  if (!more?.canAsk && !more?.until) return null;
  async function send() {
    if (!minutes || !reason) { toast.error('Pick how long and why'); return; }
    try {
      toast.success((await ask({ id: jobId, minutes, reason, note: note.trim() }).unwrap()).message);
      setOpen(false); setMinutes(0); setReason(''); setNote(''); onDone();
    } catch (err) { toast.error(errText(err, 'Could not tell the customer')); }
  }
  const chip = (on: boolean, label: string, onPress: () => void, key: string | number) => (
    <Pressable key={key} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      <Text variant="caption" weight="semibold" color={on ? zappy[700] : ink[700]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.gap}>
      {more.until ? <Text variant="caption" weight="semibold" color={ink[700]}>Customer told you finish by about {clock(more.until)}.</Text> : null}
      {more.canAsk && !open ? (
        <Pressable onPress={() => setOpen(true)} style={styles.inlineCenter} hitSlop={6} accessibilityRole="button">
          <Clock size={15} color={ink[500]} /><Text variant="bodySmall" weight="semibold" color={ink[500]}>Needs longer? Tell the customer</Text>
        </Pressable>
      ) : null}
      {more.canAsk && open ? (
        <View style={styles.gap}>
          <View style={styles.wrap}>{(more.minutes || []).map((m) => chip(minutes === m, m < 60 ? `${m} min` : `${m / 60} hr`, () => setMinutes(m), m))}</View>
          <View style={styles.wrap}>{(more.reasons || []).map((r) => chip(reason === r.code, r.label, () => setReason(r.code), r.code))}</View>
          {reason === 'other' ? <TextInput value={note} onChangeText={setNote} maxLength={200} placeholder="Why it needs longer" placeholderTextColor={ink[400]} style={styles.textArea} /> : null}
          <View style={styles.row}>
            <Button label="Cancel" variant="outline" onPress={() => setOpen(false)} style={styles.flex} />
            <Button label="Tell the customer" onPress={send} loading={isLoading} style={styles.flex} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function GiveBackCard({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());
  const { data, isFetching, refetch } = useJobGiveBackQuery({ id: jobId, reason: reason || 'other', status }, { skip: !jobId, pollingInterval: 60000 });
  const [giveBack, { isLoading: giving }] = useGiveBackJobMutation();
  const [reportAbsent, { isLoading: reporting }] = useReportCustomerAbsentMutation();
  const absent = data?.customerAbsent;
  useEffect(() => {
    if (!absent || absent.open) return undefined;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [absent]);

  const safetyCard = <SafetyCheck jobId={jobId} safety={data?.safety} onDone={refetch} />;
  const more: More | undefined = data?.moreTime;
  const moreCard = <MoreTime jobId={jobId} more={more} onDone={refetch} />;
  if (!data || (!data.canGiveBack && !absent)) {
    return data?.safety?.asked || more?.canAsk || more?.until ? <JobCard>{safetyCard}{moreCard}</JobCard> : null;
  }
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
      {safetyCard}
      {moreCard}
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
  safety: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, borderWidth: 2, borderColor: accent[100], backgroundColor: accent[50] },
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
