import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, CheckCircle, Clock, Calendar, MapPin, Users, Phone, Star,
  MessageCircle, XCircle, Loader2, AlertCircle, CreditCard, PartyPopper,
} from 'lucide-react';
import {
  useGetEventBookingQuery, useCancelEventBookingMutation,
  useSubmitEventReviewMutation, useCreateEventRemainingOrderMutation,
  useVerifyEventRemainingPaymentMutation,
} from '@shared/services/api';
import { openCheckout } from '@shared/services/cashfree';
import toast from 'react-hot-toast';

const STEP_MAP = {
  pending_payment:  { label: 'Awaiting Payment',  step: 0, color: 'text-slate-400' },
  confirmed:        { label: 'Booking Confirmed', step: 1, color: 'text-blue-600'  },
  partner_assigned: { label: 'Partner on Way',    step: 2, color: 'text-zappy-600'},
  in_progress:      { label: 'Event in Progress', step: 3, color: 'text-orange-600'},
  completed:        { label: 'Event Completed',   step: 4, color: 'text-green-600' },
  cancelled:        { label: 'Cancelled',         step: -1, color: 'text-red-500'  },
};

const TIMELINE = ['Payment', 'Confirmed', 'Assigned', 'In Progress', 'Completed'];


export default function EventBookingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPaid = searchParams.get('paid') === 'true';

  const { data, isLoading, refetch } = useGetEventBookingQuery(id);
  const [cancelBooking] = useCancelEventBookingMutation();
  const [submitReview] = useSubmitEventReviewMutation();
  const [createRemainingOrder] = useCreateEventRemainingOrderMutation();
  const [verifyRemainingPayment] = useVerifyEventRemainingPaymentMutation();

  const [showCancel, setShowCancel]   = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showReview, setShowReview]   = useState(false);
  const [rating, setRating]           = useState(5);
  const [review, setReview]           = useState('');
  const [payingRemaining, setPayingRemaining] = useState(false);
  const [submitting, setSubmitting]   = useState(false);

  const booking = data?.booking;
  const status  = booking?.status;
  const stepInfo = STEP_MAP[status] || STEP_MAP.pending_payment;
  const currentStep = stepInfo.step;

  async function handleCancel() {
    setSubmitting(true);
    try {
      await cancelBooking({ id, reason: cancelReason }).unwrap();
      toast.success('Booking cancelled');
      setShowCancel(false);
      refetch();
    } catch (e) { toast.error(e?.data?.error || 'Failed to cancel'); }
    finally { setSubmitting(false); }
  }

  async function handleReview() {
    setSubmitting(true);
    try {
      await submitReview({ id, rating, review }).unwrap();
      toast.success('Review submitted!');
      setShowReview(false);
      refetch();
    } catch (e) { toast.error(e?.data?.error || 'Failed to submit review'); }
    finally { setSubmitting(false); }
  }

  async function handlePayRemaining() {
    setPayingRemaining(true);
    try {
      const orderRes = await createRemainingOrder(id).unwrap();
      const checkoutResp = await openCheckout({
        paymentSessionId: orderRes.paymentSessionId,
        cfOrderId:        orderRes.cfOrderId,
        cashfreeEnv:      orderRes.cashfreeEnv || import.meta.env.VITE_CASHFREE_ENV || 'sandbox',
        amountPaise:      orderRes.amountPaise,
        purpose:          'Event — Remaining Payment',
      });
      await verifyRemainingPayment({
        id,
        cfOrderId:   checkoutResp.cfOrderId,
        cfPaymentId: checkoutResp.cfPaymentId,
      }).unwrap();
      toast.success('Remaining payment done!');
      refetch();
    } catch (e) {
      const msg = e?.message || e?.data?.error || 'Payment failed';
      if (!msg.includes('cancelled')) toast.error(msg);
    } finally { setPayingRemaining(false); }
  }

  if (isLoading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-violet-400" />
    </div>
  );
  if (!booking) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center"><p className="text-4xl mb-2">😔</p><p className="text-slate-600">Booking not found</p></div>
    </div>
  );

  const canCancel  = ['confirmed', 'pending_payment'].includes(status);
  const canReview  = status === 'completed' && !booking.reviewedAt;
  const canPayRem  = status !== 'pending_payment' && status !== 'cancelled' && booking?.remainingPayment?.status === 'pending' && booking?.advancePayment?.status === 'paid';

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Confetti banner on new payment */}
      {isPaid && (
        <motion.div initial={{ y: -60 }} animate={{ y: 0 }} className="bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white px-4 py-3 flex items-center gap-2">
          <PartyPopper size={18} />
          <p className="text-sm font-bold">Booking confirmed! Your event is all set 🎉</p>
        </motion.div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/events/bookings')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <ArrowLeft size={18} className="text-slate-700" />
          </button>
          <div>
            <h1 className="font-bold text-slate-900">Booking Details</h1>
            <p className={`text-xs font-semibold ${stepInfo.color}`}>{stepInfo.label}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Progress timeline */}
        {status !== 'cancelled' && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <div className="flex items-center justify-between">
              {TIMELINE.map((label, i) => (
                <div key={label} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i < currentStep ? 'bg-green-500 text-white' : i === currentStep ? 'bg-violet-600 text-white ring-4 ring-violet-100' : 'bg-slate-100 text-slate-400'}`}>
                    {i < currentStep ? <CheckCircle size={14} /> : i + 1}
                  </div>
                  <span className={`text-[9px] font-semibold text-center ${i === currentStep ? 'text-violet-600' : i < currentStep ? 'text-green-600' : 'text-slate-400'}`}>{label}</span>
                  {i < TIMELINE.length - 1 && (
                    <div className={`absolute h-0.5 w-8 translate-x-5 ${i < currentStep ? 'bg-green-400' : 'bg-slate-200'}`} style={{ left: `${(i / (TIMELINE.length - 1)) * 100}%` }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Theme + booking info */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {booking.themeId?.coverImage && (
            <img src={booking.themeId.coverImage} alt="" className="w-full h-40 object-cover" />
          )}
          <div className="p-4 space-y-2">
            <h2 className="font-bold text-slate-900">{booking.themeId?.title}</h2>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div className="flex items-center gap-1.5"><Calendar size={12} className="text-violet-500" />{booking.eventDate ? new Date(booking.eventDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</div>
              <div className="flex items-center gap-1.5"><Clock size={12} className="text-violet-500" />{booking.eventTimeSlot}</div>
              <div className="flex items-center gap-1.5"><MapPin size={12} className="text-violet-500" />{booking.address?.line1}, {booking.address?.city}</div>
              <div className="flex items-center gap-1.5"><Users size={12} className="text-violet-500" />{booking.guestCount} guests</div>
            </div>
            {booking.notes && <p className="text-xs text-zappy-600 bg-zappy-50 rounded-lg px-3 py-2 mt-1">📝 {booking.notes}</p>}
          </div>
        </div>

        {/* Payment summary */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Payment Summary</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Total Amount</span><span className="font-bold">₹{Math.round((booking.pricing?.totalPaise || 0) / 100).toLocaleString('en-IN')}</span></div>
            <div className="flex justify-between">
              <span className="text-slate-600">Advance Paid</span>
              <span className={`font-semibold ${booking.advancePayment?.status === 'paid' ? 'text-green-600' : 'text-slate-400'}`}>
                {booking.advancePayment?.status === 'paid' ? `✅ ₹${Math.round((booking.pricing?.advancePaise || 0) / 100).toLocaleString('en-IN')}` : 'Pending'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Remaining</span>
              <span className={`font-semibold ${booking.remainingPayment?.status === 'paid' ? 'text-green-600' : 'text-orange-600'}`}>
                {booking.remainingPayment?.status === 'paid' ? `✅ ₹${Math.round((booking.pricing?.remainingPaise || 0) / 100).toLocaleString('en-IN')}` : `₹${Math.round((booking.pricing?.remainingPaise || 0) / 100).toLocaleString('en-IN')} due`}
              </span>
            </div>
          </div>
        </div>

        {/* Partner info — only shown post-confirmation */}
        {booking.partnerId?.businessName && ['confirmed', 'partner_assigned', 'in_progress', 'completed'].includes(status) && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Your Decorator</p>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-violet-400 to-fuchsia-400 rounded-xl flex items-center justify-center text-white font-black">
                {booking.partnerId.businessName?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900 text-sm">{booking.partnerId.businessName}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={11} className="text-amber-400 fill-amber-400" />
                  <span className="text-xs text-slate-500">{booking.partnerId.rating?.toFixed(1)} · {booking.partnerId.completedEvents} events</span>
                </div>
              </div>
              {booking.partnerId.phone && (
                <a href={`tel:${booking.partnerId.phone}`} className="w-9 h-9 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center">
                  <Phone size={14} className="text-green-600" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Review */}
        {canReview && !showReview && (
          <button onClick={() => setShowReview(true)}
            className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2">
            <Star size={15} />Rate Your Experience
          </button>
        )}
        {showReview && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <p className="font-bold text-slate-900">How was your event?</p>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setRating(s)}>
                  <Star size={28} className={s <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                </button>
              ))}
            </div>
            <textarea value={review} onChange={e => setReview(e.target.value)} placeholder="Tell us about your experience…" rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 resize-none" />
            <button onClick={handleReview} disabled={submitting}
              className="w-full py-3 bg-violet-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
              Submit Review
            </button>
          </div>
        )}

        {/* Already reviewed */}
        {status === 'completed' && booking.reviewedAt && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle size={18} className="text-green-500" />
            <div>
              <p className="text-sm font-semibold text-green-800">Review submitted</p>
              <div className="flex gap-0.5 mt-0.5">{Array.from({ length: booking.userRating || 5 }).map((_, i) => <Star key={i} size={12} className="text-amber-400 fill-amber-400" />)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-4 py-4 space-y-2">
        {canPayRem && (
          <button onClick={handlePayRemaining} disabled={payingRemaining}
            className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {payingRemaining ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
            Pay Remaining ₹{Math.round((booking?.pricing?.remainingPaise || 0) / 100).toLocaleString('en-IN')}
          </button>
        )}
        {canCancel && !showCancel && (
          <button onClick={() => setShowCancel(true)}
            className="w-full py-3 border-2 border-red-200 text-red-500 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-red-50">
            <XCircle size={15} />Cancel Booking
          </button>
        )}
        {showCancel && (
          <div className="space-y-2">
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reason for cancellation (optional)…" rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none resize-none" />
            <div className="flex gap-2">
              <button onClick={handleCancel} disabled={submitting}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1 disabled:opacity-60">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}Confirm Cancel
              </button>
              <button onClick={() => setShowCancel(false)} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-medium text-sm">Keep</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
