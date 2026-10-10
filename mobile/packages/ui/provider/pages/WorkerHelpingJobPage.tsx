/**
 * A helping task (errands: buy, pick up, return, exchange), for the helper
 * doing it (the websites' WorkerHelpingJobPage): steps with the start code,
 * an arrival photo, each item bought / not found / an alternative for the
 * customer to approve, money fronted at the till, the handover for returns,
 * then payment and completion. Rules are the shared jobFlows logic.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft } from 'lucide-react-native';
import {
  useGetHelpingTaskQuery,
  useAdvanceHelpingStatusMutation,
  useAddHelpingProofMutation,
  useCompleteHelpingTaskMutation,
  useCollectHelpingCashMutation,
} from '@zappy/core/api';
import { useTripPublish } from '@zappy/core/hooks/useJobTrip';
import {
  helpingPaidAt,
  helpingFinishesAt,
  helpingMoveLabel,
  helpingNextMoves,
  isReturnTask,
  HELPING_DONE,
  HELPING_NO_SOS,
  tripOf,
  pointOf,
} from '@zappy/core/shared/jobFlows';
import { billTipPaise } from '@zappy/core/shared/money';
import { Button, EmptyState, LoadingState, Text } from '../../components';
import { toast } from '../../components/Toast';
import { CollectPaymentCard } from '../../components/common/CollectPaymentCard';
import { ProofPhotos, readyKeys, type ProofPhoto } from '../../components/common/ProofPhotos';
import { JobCard } from '../../components/jobs/JobCard';
import { JobChatButton } from '../../components/jobs/JobChatButton';
import { JobEarningsCard } from '../../components/worker/JobEarningsCard';
import { JobMapCard } from '../../components/worker/JobMapCard';
import { RateCustomerCard } from '../../components/worker/RateCustomerCard';
import { SOSButton } from '../../components/worker/SOSButton';
import { useStartCodePrompt } from '../../components/worker/StartCodePrompt';
import { TripSharingBanner } from '../../components/worker/TripSharingBanner';
import { errText } from '../../lib/feedback';
import { colors, ink, slate, accent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { GiveBackCard } from '../GiveBackCard';
import { OnSiteCard } from '../OnSiteCard';
import { ReturnExecution } from '../components/helping/ReturnExecution';
import { ShoppingExecution } from '../components/helping/ShoppingExecution';
import type { Task } from '../components/helping/types';

export function WorkerHelpingJobPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useGetHelpingTaskQuery(id, { pollingInterval: 10000 });
  const [advance] = useAdvanceHelpingStatusMutation();
  const [addProof] = useAddHelpingProofMutation();
  const [complete, { isLoading: completing }] = useCompleteHelpingTaskMutation();
  const [collectCash, { isLoading: collecting }] = useCollectHelpingCashMutation();
  const [arrival, setArrival] = useState<ProofPhoto[]>([]);
  const gate = useStartCodePrompt();
  const task: Task | undefined = data?.task;
  const trip = tripOf('helping', task);
  const sharing = useTripPublish(id, Boolean(trip));

  if (isLoading) return <View style={styles.page}><LoadingState /></View>;
  if (!task) return <View style={[styles.page, styles.center]}><EmptyState title="Task not found" actionLabel="Back to work" onAction={() => router.replace('/worker/work' as never)} /></View>;

  const isReturn = isReturnTask(task);
  const pendingApproval = (task.approvals || []).some((a) => a.status === 'pending');
  const due = data.due || { totalPaise: 0, itemsPending: false };
  const nextMoves: string[] = helpingNextMoves(task, due, pendingApproval);
  const settledUp = due.totalPaise <= 0 && !due.itemsPending;

  async function move(status: string) {
    try {
      if (status === 'TASK_STARTED' && readyKeys(arrival).length) {
        await Promise.all(readyKeys(arrival).map((key) => addProof({ id: task!._id, kind: 'arrival', key }).unwrap()));
      }
      await gate.run((code) => advance({ id: task!._id, status, code }).unwrap().then((r: unknown) => { refetch(); return r; }));
    } catch (err) { toast.error(errText(err, 'Could not update the task')); }
  }
  async function finish() {
    try {
      await gate.run((code) => complete({ id: task!._id, code }).unwrap().then((r: unknown) => {
        toast.success('Task completed and settled'); router.replace('/worker/work' as never); return r;
      }));
    } catch (err) { toast.error(errText(err, 'Could not complete the task')); }
  }
  async function recordCash() {
    try { await collectCash(task!._id).unwrap(); toast.success('Service fee recorded'); refetch(); }
    catch (err) { toast.error(errText(err, 'Could not record the payment')); }
  }

  return (
    <View style={styles.page}>
      {gate.prompt}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/worker/work' as never))} accessibilityLabel="Back" hitSlop={8} style={styles.back}><ArrowLeft size={20} color={ink[900]} /></Pressable>
        <View style={styles.flex}>
          <Text variant="body" weight="bold" numberOfLines={1}>{task.title || task.reference}</Text>
          <Text variant="caption" color={ink[400]}>{task.status.replace(/_/g, ' ')}</Text>
        </View>
        <JobChatButton jobId={task._id} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxxl }]} keyboardShouldPersistTaps="handled">
        {trip ? <TripSharingBanner sharing={sharing} to={trip.to} toCustomer={trip.toCustomer} /> : null}
        <OnSiteCard onSite={task.onSite as never} />
        <GiveBackCard jobId={task._id} status={task.status} />
        {!HELPING_DONE.includes(task.status) && !['CANCELLED', 'FAILED'].includes(task.status) ? <JobMapCard to={pointOf(task.pickupLocation)} label="Pickup" /> : null}
        {task.instructions ? <JobCard><Text variant="bodySmall" color={ink[700]}>{task.instructions}</Text></JobCard> : null}

        {nextMoves.map((s) => <Button key={s} label={helpingMoveLabel(s, task)} onPress={() => move(s)} fullWidth size="large" />)}

        {task.status === 'ARRIVED' ? (
          <ProofPhotos photos={arrival} onChange={setArrival} folder="helping/arrival" max={2} title="Arrival photo" hint="A quick photo confirms you're at the right place." />
        ) : null}

        {isReturn ? <ReturnExecution task={task} onChanged={refetch} /> : <ShoppingExecution task={task} onChanged={refetch} disabled={pendingApproval} />}

        {pendingApproval ? (
          <JobCard tone="amber" style={styles.row}>
            <AlertTriangle size={14} color={accent[700]} />
            <Text variant="caption" color={accent[700]} style={styles.flex}>Waiting on the customer's decision. You'll be notified the moment they answer.</Text>
          </JobCard>
        ) : null}

        {['IN_PROGRESS', 'AT_DROPOFF', 'HANDED_OVER'].includes(task.status) && !pendingApproval && due.itemsPending ? (
          <JobCard><Text variant="caption" color={ink[700]}>Mark every item as bought or unavailable. The customer's bill is worked out from your receipts.</Text></JobCard>
        ) : null}

        {helpingPaidAt(task).includes(task.status) && !pendingApproval && !due.itemsPending && due.totalPaise > 0 ? (
          <CollectPaymentCard amountPaise={due.totalPaise} tipPaise={billTipPaise(task)} paymentMethod={due.feePaise > 0 ? task.paymentMethod : 'cash'}
            paid={false} collecting={collecting} onCollect={recordCash} what={due.itemsPaise > 0 ? 'items and service fee' : 'service fee'} />
        ) : null}

        {helpingFinishesAt(task).includes(task.status) && !pendingApproval && settledUp
          ? <Button label="Complete task" variant="success" onPress={finish} loading={completing} fullWidth size="large" /> : null}
        {HELPING_DONE.includes(task.status) ? <JobEarningsCard jobId={task._id} /> : null}
        {HELPING_DONE.includes(task.status) ? <RateCustomerCard jobId={task._id} rated={!!task.customerRating?.stars} /> : null}
        {!HELPING_NO_SOS.includes(task.status) ? <SOSButton jobId={task._id} kind="helping" service={task.serviceType} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  body: { padding: spacing.base, gap: spacing.md },
});
