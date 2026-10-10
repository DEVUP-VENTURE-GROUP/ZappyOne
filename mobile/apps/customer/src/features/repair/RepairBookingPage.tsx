/**
 * A repair, tracked live on the shared tracking page (the website's
 * RepairBookingPage). Repair-specific here: the handover codes, a quote to
 * approve, the rating with a comment, the warranty, the quote history and how
 * to pay. The service report opens on the website for now (it is a printable
 * page, and the apps have no document viewer yet).
 */
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCancelRepairBookingMutation, useGetRepairBookingQuery } from '@zappy/core/api';
import { KINDS } from '@zappy/core/shared/jobKinds';
import { formatPaise } from '@zappy/core/shared/money';
import { repairRebookHref } from '@zappy/core/shared/useMyJobs';
import { EmptyState, LoadingState, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { JobTrackingPage } from '../tracking/JobTrackingPage';
import type { TrackedJob } from '../tracking/types';
import { useJobSOS } from '../tracking/useJobSOS';
import { HandoverCode } from './booking/HandoverCode';
import { PaymentNote } from './booking/PaymentNote';
import { QuoteCard, type Quote } from './booking/QuoteCard';
import { QuoteHistory } from './booking/QuoteHistory';
import { RateRepair } from './booking/RateRepair';
import { REPAIR_STATUS } from './booking/repairStatusCopy';
import { RepairWarrantyCard } from './booking/RepairWarrantyCard';

export function RepairBookingPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, refetch } = useGetRepairBookingQuery(id, { pollingInterval: 30000 });
  const [cancel] = useCancelRepairBookingMutation();
  const sos = useJobSOS(id);

  if (isLoading) return <LoadingState />;
  const booking = data?.booking;
  if (!booking) return <View style={styles.page}><EmptyState title="Booking not found" actionLabel="Book a repair" onAction={() => router.replace('/repair' as never)} /></View>;

  const quotes: Quote[] = data.quotes || [];
  const pendingQuote = quotes.find((q) => q.status === 'sent' || q.status === 'clarification_requested');
  const job = KINDS.repair.toJob(data, { statusLabel: REPAIR_STATUS[booking.status]?.label }) as TrackedJob;
  const hint = REPAIR_STATUS[booking.status]?.hint;

  async function doCancel(reason: string) {
    try {
      const res = await cancel({ id, reason }).unwrap();
      toast.success(res?.cancellation?.feePaise > 0 ? `Cancelled. ${formatPaise(res.cancellation.feePaise)} fee applied` : 'Booking cancelled');
      refetch();
    } catch (err) { toast.error(errText(err, 'Could not cancel. Try again.')); }
  }

  return (
    <JobTrackingPage job={job} onSOS={sos} rebookHref={repairRebookHref(booking)} cancel={data.canCancel ? { run: doCancel } : null}
      extras={(
        <>
          <HandoverCode booking={booking} />
          {hint ? <View style={styles.hint}><Text variant="caption" color={ink[700]}>{hint}</Text></View> : null}
          {pendingQuote ? <QuoteCard quote={pendingQuote} onDecided={refetch} /> : null}
          <RateRepair booking={booking} />
          <RepairWarrantyCard booking={booking} />
          <PaymentNote booking={booking} />
          <QuoteHistory quotes={quotes} />
        </>
      )} />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  hint: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
