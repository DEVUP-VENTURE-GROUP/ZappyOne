/**
 * A booking from the first version of ZappyOne (a service order), on the
 * shared tracking page through the order kind (core/shared/jobKinds): status,
 * the pro, the summary and invoice-style lines, cancelling before the pro has
 * arrived (the website's rule), and rating once it is done.
 */
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCancelOrderMutation, useGetOrderQuery, useRateOrderMutation } from '@zappy/core/api';
import { KINDS } from '@zappy/core/shared/jobKinds';
import { EmptyState, LoadingState } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { colors } from '@zappy/ui/theme/colors';
import { JobTrackingPage } from './JobTrackingPage';
import type { TrackedJob } from './types';

export function OrderTrackingPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, isLoading, refetch } = useGetOrderQuery(id, { pollingInterval: 30000 });
  const [cancel] = useCancelOrderMutation();
  const [rate] = useRateOrderMutation();

  if (isLoading) return <LoadingState />;
  const order = data?.order;
  if (!order) return <View style={styles.page}><EmptyState title={t('booking.notFound', 'Booking not found')} actionLabel={t('soon.home', 'Go to home')} onAction={() => router.replace('/' as never)} /></View>;
  const job = KINDS.order.toJob(data, {}) as TrackedJob;
  const canCancel = !job.terminal && !['arrived', 'in_progress'].includes(job.status);

  return (
    <JobTrackingPage job={job}
      cancel={canCancel ? {
        note: t('order.cancelNote', 'You can cancel until your pro arrives.'),
        run: async (reason) => {
          try { await cancel({ id, reason: reason || 'user_cancelled' }).unwrap(); toast.success(t('booking.cancelled', 'Booking cancelled')); refetch(); }
          catch (err) { toast.error(errText(err, t('booking.cancelFailed', 'Could not cancel. Try again.'))); }
        },
      } : null}
      onRate={job.status === 'completed' && order.userRating == null ? async (rating) => {
        try { await rate({ id, rating }).unwrap(); toast.success(t('booking.rated', 'Thanks for your feedback!')); refetch(); }
        catch (err) { toast.error(errText(err, t('booking.rateFailed', 'Could not save your rating. Try again.'))); }
      } : undefined} />
  );
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background } });
