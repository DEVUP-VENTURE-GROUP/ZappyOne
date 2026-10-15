/**
 * A pet booking, tracked live on the shared tracking page (the website's
 * PetBookingDetailPage): pet words for each stage, the start code at the door
 * (not when the pet is brought in), rating, and cancelling. Paying is in cash.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useCancelPetBookingMutation, useGetPetBookingQuery, useRatePetBookingMutation } from '@zappy/core/api';
import { KINDS } from '@zappy/core/shared/jobKinds';
import { EmptyState, LoadingState } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { colors } from '@zappy/ui/theme/colors';
import { JobTrackingPage } from '../tracking/JobTrackingPage';
import type { TrackedJob } from '../tracking/types';
import { useJobSOS } from '../tracking/useJobSOS';

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested', PRICE_PENDING: 'Getting your price', AWAITING_CUSTOMER_APPROVAL: 'Your approval needed',
  BOOKED: 'Booked', PROVIDER_SEARCHING: 'Finding a pet pro', PROVIDER_ASSIGNED: 'Waiting for your pet pro to accept',
  PROVIDER_ACCEPTED: 'Pet pro confirmed', PROVIDER_EN_ROUTE: 'On the way', PROVIDER_ARRIVED: 'Arrived', PET_HANDOVER: 'Pet handed over',
  SERVICE_STARTED: 'In progress', SERVICE_PAUSED: 'Paused', SERVICE_COMPLETED: 'Completed', CUSTOMER_CONFIRMATION: 'Completed',
  PAYMENT_PENDING: 'Completed, payment due', PAYMENT_COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Under review', CLOSED: 'Closed',
};

export function PetBookingDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, isLoading, refetch } = useGetPetBookingQuery(id, { pollingInterval: 30000 });
  const [cancel] = useCancelPetBookingMutation();
  const [rate] = useRatePetBookingMutation();
  const sos = useJobSOS(id);

  if (isLoading) return <LoadingState />;
  const b = data?.booking;
  if (!b) return <View style={{ flex: 1, backgroundColor: colors.background }}><EmptyState title={t('booking.notFound', 'Booking not found')} actionLabel={t('pet.title', 'Pet Services')} onAction={() => router.replace('/pet' as never)} /></View>;
  const job = KINDS.pet.toJob(data, { statusLabel: t(`petStatus.${b.status}`, STATUS_LABEL[b.status] || b.status) }) as TrackedJob;

  return (
    <JobTrackingPage job={job} onSOS={sos} rebookHref={b.categoryCode ? `/pet/book/${b.categoryCode}` : null}
      startCode={b.serviceMode !== 'provider_location' ? b.handoverOtp : null}
      cancel={data.canCancel ? {
        note: t('pet.cancelNote', 'Cancelling before your pet pro sets off is free. Later, the cancellation policy for this service applies.'),
        run: async (reason) => {
          try { await cancel({ id: b._id, reason }).unwrap(); toast.success(t('booking.cancelled', 'Booking cancelled')); refetch(); }
          catch (err) { toast.error(errText(err, t('booking.cancelFailed', 'Could not cancel. Try again.'))); }
        },
      } : null}
      onRate={!b.ratedAt ? async (rating) => {
        try { await rate({ id: b._id, rating }).unwrap(); toast.success(t('booking.rated', 'Thanks for rating')); refetch(); }
        catch (err) { toast.error(errText(err, t('booking.rateFailed', 'Could not save your rating. Try again.'))); }
      } : undefined} />
  );
}
