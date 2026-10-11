/**
 * A helping task, tracked live on the shared tracking page (the website's
 * HelpingTaskDetailPage): decisions the helper needs, the items and what each
 * cost, a return's refund status, and what is due, item money always apart
 * from the service fee. The customer's code is due when the shopping arrives,
 * or at the door for a return.
 */
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCancelHelpingTaskMutation, useGetHelpingTaskQuery, useRateHelpingTaskMutation, useRespondHelpingApprovalMutation } from '@zappy/core/api';
import { KINDS } from '@zappy/core/shared/jobKinds';
import { formatPaise } from '@zappy/core/shared/money';
import { EmptyState, LoadingState, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { JobTrackingPage } from '../tracking/JobTrackingPage';
import type { TrackedJob } from '../tracking/types';
import { useJobSOS } from '../tracking/useJobSOS';
import { ApprovalCard, type Approval } from './task/ApprovalCard';
import { ReturnStatusCard } from './task/ReturnStatusCard';
import { TaskItemsCard } from './task/TaskItemsCard';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', REQUESTED: 'Requested', PAYMENT_PENDING: 'Payment pending', CONFIRMED: 'Confirmed', WORKER_SEARCHING: 'Finding a helper',
  WORKER_ASSIGNED: 'Helper assigned', WORKER_ACCEPTED: 'Helper confirmed', EN_ROUTE: 'Helper on the way', ARRIVED: 'Helper arrived',
  TASK_STARTED: 'Started', IN_PROGRESS: 'In progress', APPROVAL_REQUIRED: 'Your decision needed', RETURNING: 'On the way back',
  AT_DROPOFF: 'At the drop-off', HANDED_OVER: 'Handed over', COMPLETED: 'Completed', CUSTOMER_CONFIRMED: 'Completed', SETTLED: 'Completed',
  CANCELLED: 'Cancelled', FAILED: 'Could not be completed', ITEM_UNAVAILABLE: 'Item unavailable', MERCHANT_REJECTED: 'Merchant did not accept it',
  EXCHANGE_UNAVAILABLE: 'Replacement unavailable', DISPUTED: 'Under review',
};
const RETURNS = ['return', 'exchange'];

/** When the customer's code is due: at the door for a return; on delivery for shopping. */
function codeStageFor(t: { serviceType: string; status: string }) {
  if (RETURNS.includes(t.serviceType)) return null;
  if (['RETURNING', 'AT_DROPOFF'].includes(t.status)) return 'arrived';
  if (['WORKER_ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'TASK_STARTED', 'IN_PROGRESS', 'APPROVAL_REQUIRED'].includes(t.status)) return 'on_the_way';
  return 'done';
}

export function HelpingTaskDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, isLoading, refetch } = useGetHelpingTaskQuery(id, { pollingInterval: 30000 });
  const [respond] = useRespondHelpingApprovalMutation();
  const [cancel] = useCancelHelpingTaskMutation();
  const [rate] = useRateHelpingTaskMutation();
  const sos = useJobSOS(id);

  if (isLoading) return <LoadingState />;
  const task = data?.task;
  if (!task) return <View style={styles.page}><EmptyState title={t('helpTask.notFound', 'Task not found')} actionLabel={t('help.title', 'Helping Services')} onAction={() => router.replace('/helping' as never)} /></View>;

  const job = KINDS.helping.toJob(data, { statusLabel: t(`helpStatus.${task.status}`, STATUS_LABEL[task.status] || task.status) }) as TrackedJob;
  const due = data.due || { totalPaise: 0, itemsPaise: 0, itemsPending: false };
  const closed = ['CANCELLED', 'FAILED', 'SETTLED'].includes(task.status);
  const pending: Approval[] = (task.approvals || []).filter((a: Approval) => a.status === 'pending');
  const stage = codeStageFor(task);

  async function answer(approvalId: string, approved: boolean) {
    try { await respond({ id: task._id, approvalId, approved }).unwrap(); toast.success(approved ? t('helpTask.approved', 'Approved') : t('helpTask.declined', 'Declined')); refetch(); }
    catch (err) { toast.error(errText(err, t('helpTask.answerFailed', 'Could not send your answer. Try again.'))); }
  }

  return (
    <JobTrackingPage job={job} onSOS={sos} rebookHref={RETURNS.includes(task.serviceType) ? '/helping/returns' : '/helping/shopping'}
      startCode={stage === 'done' ? null : task.handoverOtp} codeStage={stage === 'done' ? null : stage}
      cancel={data.canCancel ? {
        note: t('helpTask.cancelNote', 'Cancelling before your helper starts is free. Any budget held for items comes back to you.'),
        run: async (reason) => {
          try { await cancel({ id: task._id, reason }).unwrap(); toast.success(t('helpTask.cancelled', 'Task cancelled')); refetch(); }
          catch (err) { toast.error(errText(err, t('booking.cancelFailed', 'Could not cancel. Try again.'))); }
        },
      } : null}
      onRate={!task.ratedAt ? async (rating) => {
        try { await rate({ id: task._id, rating }).unwrap(); toast.success(t('helpTask.thanks', 'Thanks for the feedback')); refetch(); }
        catch (err) { toast.error(errText(err, t('booking.rateFailed', 'Could not save your rating. Try again.'))); }
      } : undefined}
      extras={(
        <>
          {pending.map((a) => <ApprovalCard key={a._id} a={a} onAnswer={(ok) => answer(a._id, ok)} />)}
          <TaskItemsCard items={task.items || []} itemsPending={!!due.itemsPending} />
          {task.returnDetail ? <ReturnStatusCard detail={task.returnDetail} /> : null}
          {!closed && due.totalPaise > 0 && due.itemsPaise > 0 ? (
            <View style={styles.due}>
              <Text variant="body" weight="bold">{t('helpTask.due', 'Due now')}: {formatPaise(due.totalPaise)}</Text>
              <Text variant="caption" color={ink[500]}>{t('helpTask.dueCash', 'Items and the service fee, paid to your helper in cash at delivery.')}</Text>
            </View>
          ) : null}
        </>
      )} />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  due: { gap: 4, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
