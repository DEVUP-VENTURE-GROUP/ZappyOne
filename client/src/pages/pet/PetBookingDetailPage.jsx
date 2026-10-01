import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetPetBookingQuery, useCancelPetBookingMutation, useRatePetBookingMutation } from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';
import { PayNowButton } from '@shared/components/common/PayMethodPicker';
import JobTrackingPage from '../../tracking/JobTrackingPage';
import { KINDS } from '../../tracking/kinds';
import { useJobSOS } from '../../tracking/useJobSOS';

/**
 * A pet booking, tracked live on the shared page (tracking/JobTrackingPage).
 * Pet-specific here: the words for each stage, the start code at the door,
 * and paying online.
 */

const STATUS_LABEL = {
  REQUESTED: 'Requested', PRICE_PENDING: 'Getting your price', AWAITING_CUSTOMER_APPROVAL: 'Your approval needed',
  BOOKED: 'Booked', PROVIDER_SEARCHING: 'Finding a pet pro', PROVIDER_ASSIGNED: 'Waiting for your pet pro to accept',
  PROVIDER_ACCEPTED: 'Pet pro confirmed', PROVIDER_EN_ROUTE: 'On the way', PROVIDER_ARRIVED: 'Arrived', PET_HANDOVER: 'Pet handed over',
  SERVICE_STARTED: 'In progress', SERVICE_PAUSED: 'Paused', SERVICE_COMPLETED: 'Completed', CUSTOMER_CONFIRMATION: 'Completed',
  PAYMENT_PENDING: 'Completed · payment due', PAYMENT_COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Under review', CLOSED: 'Closed',
};
const NOTHING_TO_PAY = ['CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED', 'REJECTED', 'PRICE_PENDING', 'AWAITING_CUSTOMER_APPROVAL'];

export default function PetBookingDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetPetBookingQuery(id, { pollingInterval: 30000 });
  const [cancel] = useCancelPetBookingMutation();
  const [rate] = useRatePetBookingMutation();
  const sos = useJobSOS(id);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 size={24} className="animate-spin text-zappy-500" /></div>;
  if (!data?.booking) return <p className="py-24 text-center text-slate-500">Booking not found</p>;

  const b = data.booking;
  const job = KINDS.pet.toJob(data, { statusLabel: STATUS_LABEL[b.status] });
  const payOnline = b.paymentMethod === 'online' && b.paymentStatus !== 'paid' && !NOTHING_TO_PAY.includes(b.status);

  return (
    <JobTrackingPage
      job={job}
      onBack={() => nav('/orders')}
      // The owner reads this out when the pet pro is at the door (not when they bring the pet in).
      startCode={b.serviceMode !== 'provider_location' ? b.handoverOtp : null}
      onSOS={sos}
      cancel={data.canCancel ? {
        note: 'Cancelling before your pet pro sets off is free. Later, the cancellation policy for this service applies.',
        run: async () => {
          try {
            await cancel({ id: b._id, reason: 'Changed my mind' }).unwrap();
            toast.success('Booking cancelled');
            refetch();
          } catch (err) {
            toast.error(err?.data?.error || 'Could not cancel');
          }
        },
      } : null}
      onRate={!b.ratedAt ? async (rating) => {
        try { await rate({ id: b._id, rating }).unwrap(); toast.success('Thanks for rating'); refetch(); }
        catch (err) { toast.error(err?.data?.error || 'Could not save your rating'); }
      } : undefined}
      extras={payOnline ? (
        <div className="rounded-[24px] bg-white p-[18px] ring-1 ring-slate-100">
          <p className="text-[14px] font-bold text-navy">Pay online</p>
          <p className="mt-0.5 text-[12.5px] text-slate-500">{formatPaise(b.pricing?.totalPaise)} for this booking</p>
          <PayNowButton bookingSource="pet" bookingId={b._id} amountLabel={formatPaise(b.pricing?.totalPaise)} label="Pet care booking" className="mt-3" />
        </div>
      ) : null}
    />
  );
}
