import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin, Star, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetPetBookingQuery, useCancelPetBookingMutation, useRatePetBookingMutation,
} from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';
import { PayNowButton } from '@shared/components/common/PayMethodPicker';

// Statuses in which there is nothing left to pay online.
const NOTHING_TO_PAY = ['CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED', 'REJECTED', 'PRICE_PENDING', 'AWAITING_CUSTOMER_APPROVAL'];

const STATUS_LABEL = {
  REQUESTED: 'Requested', BOOKED: 'Booked', PROVIDER_SEARCHING: 'Finding a provider',
  PROVIDER_ASSIGNED: 'Provider assigned', PROVIDER_ACCEPTED: 'Provider accepted',
  PROVIDER_EN_ROUTE: 'On the way', PROVIDER_ARRIVED: 'Arrived', PET_HANDOVER: 'Pet handover',
  SERVICE_STARTED: 'In progress', SERVICE_COMPLETED: 'Completed', CUSTOMER_CONFIRMATION: 'Completed',
  PAYMENT_PENDING: 'Completed · payment due', PAYMENT_COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Under review', CLOSED: 'Closed',
};

function Shell({ children }) { return <div className="max-w-lg mx-auto px-4 py-4 space-y-3 pb-10">{children}</div>; }

export default function PetBookingDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetPetBookingQuery(id, { pollingInterval: 15000 });
  const [cancel] = useCancelPetBookingMutation();

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>;
  if (!data?.booking) return <div className="text-center py-24 text-slate-400">Booking not found</div>;

  const { booking, canCancel } = data;

  async function doCancel() {
    try {
      await cancel({ id: booking._id, reason: 'Changed my mind' }).unwrap();
      toast.success('Cancelled');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not cancel');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <h1 className="text-lg font-black text-[#0F172A]">{booking.reference}</h1>
          <p className="text-xs text-slate-400 capitalize">{booking.categoryCode.replace(/_/g, ' ')}</p>
        </div>
      </div>

      <Shell>
        <div className="rounded-2xl border-2 border-zappy-200 bg-zappy-50/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-zappy-500">Status</p>
          <p className="text-lg font-black text-[#0F172A] mt-0.5">{STATUS_LABEL[booking.status] || booking.status}</p>
        </div>

        <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pets</p>
          {booking.pets.map((p) => (
            <div key={p._id} className="flex items-center justify-between text-sm">
              <span className="font-bold text-[#0F172A]">{p.snapshot?.name}</span>
              <span className="text-slate-500">{formatPaise(p.linePaise)}</span>
            </div>
          ))}
        </div>

        {booking.serviceLocation?.address && (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 flex items-start gap-2.5 text-sm">
            <MapPin size={15} className="text-zappy-500 mt-0.5 shrink-0" />
            <span>{booking.serviceLocation.address}</span>
          </div>
        )}

        <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-1 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Price</p>
          <div className="flex justify-between"><span>Services</span><span>{formatPaise(booking.pricing.servicesPaise)}</span></div>
          {booking.pricing.addonsPaise > 0 && <div className="flex justify-between"><span>Add-ons</span><span>{formatPaise(booking.pricing.addonsPaise)}</span></div>}
          {booking.pricing.travelPaise > 0 && <div className="flex justify-between"><span>Travel</span><span>{formatPaise(booking.pricing.travelPaise)}</span></div>}
          {booking.pricing.stayDiscountPaise > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>−{formatPaise(booking.pricing.stayDiscountPaise)}</span></div>}
          <div className="flex justify-between font-black pt-1 border-t border-slate-100"><span>Total</span><span>{formatPaise(booking.pricing.totalPaise)}</span></div>
          <p className="pt-1 text-xs text-slate-500">
            {booking.paymentStatus === 'paid'
              ? 'Paid'
              : booking.paymentMethod === 'online' ? 'Online payment pending' : 'Pay the provider in cash after the service'}
          </p>
          {booking.paymentMethod === 'online' && booking.paymentStatus !== 'paid' && !NOTHING_TO_PAY.includes(booking.status) && (
            <PayNowButton
              bookingSource="pet"
              bookingId={booking._id}
              amountLabel={formatPaise(booking.pricing.totalPaise)}
              label="Pet care booking"
              className="mt-2"
            />
          )}
        </div>

        {!!(booking.proofs || []).length && (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5"><ImageIcon size={13} /> Photos</p>
            <div className="grid grid-cols-3 gap-2">
              {booking.proofs.filter((p) => p.url).map((p, i) => (
                <img key={i} src={p.url} alt={p.kind} className="rounded-lg aspect-square object-cover" />
              ))}
            </div>
          </div>
        )}

        {['SERVICE_COMPLETED', 'CUSTOMER_CONFIRMATION', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'CLOSED'].includes(booking.status) && !booking.ratedAt && (
          <RateCard bookingId={booking._id} onDone={refetch} />
        )}
        {booking.ratedAt && (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your rating</p>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={16} className={i <= booking.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />)}
            </div>
          </div>
        )}

        {canCancel && (
          <button type="button" onClick={doCancel} className="w-full rounded-2xl border-2 border-red-200 text-red-600 font-bold py-3">Cancel booking</button>
        )}
      </Shell>
    </div>
  );
}

function RateCard({ bookingId, onDone }) {
  const [stars, setStars] = useState(0);
  const [rate, { isLoading }] = useRatePetBookingMutation();

  async function submit() {
    if (!stars) { toast.error('Pick a star rating'); return; }
    try {
      await rate({ id: bookingId, rating: stars }).unwrap();
      toast.success('Thanks!');
      onDone();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not submit');
    }
  }

  return (
    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rate the provider</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" onClick={() => setStars(i)}>
            <Star size={26} className={i <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />
          </button>
        ))}
      </div>
      <button type="button" onClick={submit} disabled={isLoading} className="w-full rounded-xl bg-[#0F172A] text-white font-bold py-2.5 disabled:opacity-50">Submit</button>
    </div>
  );
}
