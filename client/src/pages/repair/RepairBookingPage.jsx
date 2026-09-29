import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Check, X, ShieldCheck, Clock, AlertTriangle,
  FileText, MessageSquare, Wrench, Star, Download,
} from 'lucide-react';
import {
  useGetRepairBookingQuery, useRespondRepairQuoteMutation, useCancelRepairBookingMutation,
} from '@shared/services/api';
import toast from 'react-hot-toast';
import { useRepairCancellationQuoteQuery, useRepairHandoverCodeQuery } from '@shared/services/api';
import HandoverCodeCard from '../../components/common/HandoverCodeCard';
import { useRateRepairBookingMutation } from '@shared/services/api';
import LiveJobCard from '../../components/tracking/LiveJobCard';
import { formatPaise } from '@shared/utils/money';
import { PayNowButton } from '@shared/components/common/PayMethodPicker';
import { API_BASE } from '@shared/services/apiBase';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';

/**
 * Customer view of a repair booking.
 *
 * The quote card is the important part: when a technician has found something
 * and priced it, the customer must be able to see exactly what they are being
 * asked to pay for, itemised, and approve or reject it (§30). No work proceeds
 * on an un-approved quote, so this screen is a hard gate, not a notification.
 */

const STATUS_COPY = {
  PENDING: { label: 'Booking placed', tone: 'slate', hint: 'Waiting for confirmation.' },
  CONFIRMED: { label: 'Confirmed', tone: 'blue', hint: 'Finding a technician for you.' },
  PROVIDER_ASSIGNED: { label: 'Technician assigned', tone: 'blue', hint: 'Waiting for them to accept.' },
  WORKER_ACCEPTED: { label: 'Technician accepted', tone: 'blue', hint: 'They will be on their way shortly.' },
  ON_THE_WAY: { label: 'On the way', tone: 'indigo', hint: 'Your technician is travelling to you.' },
  ARRIVED: { label: 'Arrived', tone: 'indigo', hint: 'Your technician has arrived.' },
  DIAGNOSING: { label: 'Diagnosing', tone: 'amber', hint: 'Inspecting your device.' },
  QUOTE_PENDING: { label: 'Preparing quote', tone: 'amber', hint: 'Your technician is writing up the quote.' },
  CUSTOMER_APPROVAL_PENDING: { label: 'Your approval needed', tone: 'amber', hint: 'Review the quote below to continue.' },
  APPROVED: { label: 'Quote approved', tone: 'emerald', hint: 'Work can now begin.' },
  PICKUP_SCHEDULED: { label: 'Pickup scheduled', tone: 'indigo', hint: 'We will collect your device.' },
  DEVICE_PICKED_UP: { label: 'Device collected', tone: 'indigo', hint: 'On its way to the workshop.' },
  AT_WORKSHOP: { label: 'At workshop', tone: 'indigo', hint: 'Your device has arrived at the workshop.' },
  REPAIR_IN_PROGRESS: { label: 'Repair in progress', tone: 'indigo', hint: 'Work is underway.' },
  QA_PENDING: { label: 'Quality checks', tone: 'amber', hint: 'Running post-repair tests.' },
  READY_FOR_RETURN: { label: 'Ready for return', tone: 'emerald', hint: 'Repaired and ready to come back.' },
  OUT_FOR_RETURN: { label: 'Out for return', tone: 'indigo', hint: 'On its way back to you.' },
  COMPLETED: { label: 'Completed', tone: 'emerald', hint: 'Repair finished.' },
  CANCELLED: { label: 'Cancelled', tone: 'slate', hint: '' },
  REJECTED: { label: 'Quote rejected', tone: 'red', hint: 'No work was carried out.' },
  EXPIRED: { label: 'Expired', tone: 'slate', hint: '' },
  FAILED: { label: 'Could not complete', tone: 'red', hint: '' },
};

const TONES = {
  slate: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-50 text-blue-700',
  indigo: 'bg-zappy-50 text-zappy-700',
  amber: 'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
};

const rupees = formatPaise;

const WITH_TECHNICIAN = ['PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'DIAGNOSING', 'QUOTE_PENDING',
  'CUSTOMER_APPROVAL_PENDING', 'APPROVED', 'REPAIR_IN_PROGRESS', 'AT_WORKSHOP', 'QA_PENDING',
  'READY_FOR_RETURN', 'OUT_FOR_RETURN', 'COMPLETED'];
const WORKING = ['REPAIR_IN_PROGRESS', 'AT_WORKSHOP', 'QA_PENDING', 'READY_FOR_RETURN', 'OUT_FOR_RETURN', 'COMPLETED'];

/** Where the repair is right now: the shared live card, in repair words. */
function LiveStatusCard({ booking, provider }) {
  const s = booking.status;
  return (
    <LiveJobCard
      kind="repair"
      job={booking}
      provider={provider}
      jobsNoun="repairs"
      label={STATUS_COPY[s]?.label || s}
      hint={STATUS_COPY[s]?.hint}
      active={!['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED'].includes(s)}
      steps={[
        { label: 'Placed', reached: true },
        { label: 'Technician', reached: WITH_TECHNICIAN.includes(s) },
        { label: 'Working', reached: WORKING.includes(s) },
        { label: 'Done', reached: s === 'COMPLETED' },
      ]}
    />
  );
}

/** Quote review — itemised, with approve / reject / ask. */
function QuoteCard({ quote, onDecided }) {
  const [respond, { isLoading }] = useRespondRepairQuoteMutation();
  const [asking, setAsking] = useState(false);
  const foundMidRepair = !!quote.isAdditional;
  const [note, setNote] = useState('');

  async function decide(decision) {
    try {
      await respond({ quoteId: quote._id, decision, reason: note }).unwrap();
      toast.success(
        decision === 'approve' ? 'Approved — work can begin'
          : decision === 'reject' ? 'Quote rejected'
            : 'Question sent to your technician',
      );
      setAsking(false);
      setNote('');
      onDecided?.();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send your response');
    }
  }

  return (
    <div className="card ring-2 ring-amber-200 bg-amber-50/40">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-amber-600" />
        <p className="font-bold text-sm text-amber-900">
          Quote {quote.revision > 1 ? `(revision ${quote.revision})` : ''} — your approval needed
        </p>
      </div>

      <p className="text-xs text-slate-600 mt-2 leading-relaxed">{quote.diagnosisSummary}</p>

      <div className="mt-3 space-y-1.5 bg-white rounded-xl p-3">
        {(quote.items || []).map((item, i) => (
          <div key={i} className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="text-[#0F172A] truncate">{item.label}</p>
              {item.quantity > 1 && <p className="text-[11px] text-slate-400">× {item.quantity}</p>}
            </div>
            <span className="font-semibold text-[#0F172A] shrink-0">{rupees(item.amountPaise)}</span>
          </div>
        ))}
        <div className="border-t border-slate-100 pt-1.5 mt-1.5 space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Subtotal</span><span>{rupees(quote.subtotalPaise)}</span>
          </div>
          {quote.taxPaise > 0 && (
            <div className="flex justify-between text-xs text-slate-500">
              <span>Tax</span><span>{rupees(quote.taxPaise)}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-[#0F172A] pt-1">
            <span>Total</span><span>{rupees(quote.totalPaise)}</span>
          </div>
        </div>
      </div>

      {quote.warrantyDays > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold mt-2">
          <ShieldCheck size={13} /> {quote.warrantyDays}-day warranty on this repair
        </p>
      )}

      {asking ? (
        <div className="mt-3 space-y-2">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="What would you like to ask?"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zappy-100 resize-none" />
          <div className="flex gap-2">
            <button onClick={() => decide('clarify')} disabled={isLoading || !note.trim()}
              className="flex-1 btn-primary">Send question</button>
            <button onClick={() => setAsking(false)} className="px-4 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold">
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={() => decide('approve')} disabled={isLoading}
            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-xl">
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Approve
          </button>
          <button onClick={() => decide('reject')} disabled={isLoading}
            className="flex items-center justify-center gap-1.5 bg-white ring-1 ring-red-200 text-red-700 font-bold text-sm py-2.5 rounded-xl">
            <X size={15} /> Decline
          </button>
          <button onClick={() => setAsking(true)}
            className="col-span-2 flex items-center justify-center gap-1.5 text-zappy-600 font-semibold text-sm py-2">
            <MessageSquare size={14} /> Ask a question first
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Cancelling, with the price attached.
 *
 * This used to be `window.confirm('Cancel this repair booking?')` — a yes/no on
 * a decision that can cost real money, asked without mentioning the money. A
 * customer would cancel on a technician standing outside their door and learn
 * about the fee afterwards, which is how a support ticket is manufactured.
 *
 * The figure is fetched fresh when the sheet opens, because it depends on the
 * booking's status right now and on how often this customer has cancelled
 * recently. While it loads the confirm button stays disabled: agreeing to an
 * amount nobody has shown you is not agreement.
 */
function CancelSheet({ bookingId, onClose, onConfirm, busy }) {
  const { data: quote, isLoading } = useRepairCancellationQuoteQuery(bookingId);

  const blocked = quote && quote.allowed === false;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-sm">
        <p className="text-base font-black text-[#0F172A]">
          {blocked ? 'This one needs us' : 'Cancel this repair?'}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} className="animate-spin text-slate-300" />
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
              {quote?.message || 'You can cancel this booking.'}
            </p>

            {!blocked && (quote?.feePaise > 0 || quote?.earnedPaise > 0) && (
              <div className="mt-3 space-y-1.5 rounded-2xl bg-slate-50 p-3">
                {quote.earnedPaise > 0 && (
                  <Row label="Inspection already done" value={rupees(quote.earnedPaise)} />
                )}
                {quote.feePaise > 0 && (
                  <Row label="Cancellation fee" value={rupees(quote.feePaise)} />
                )}
                {quote.paidPaise > 0 && (
                  <div className="mt-1 border-t border-slate-200 pt-1.5">
                    <Row label="Back to you" value={rupees(quote.refundPaise)} strong />
                  </div>
                )}
              </div>
            )}

            {!blocked && quote?.feePaise > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Cancellation fees go to the Worker Shield Fund, which compensates
                technicians for time they have already given up.
              </p>
            )}
          </>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600"
          >
            {blocked ? 'Close' : 'Keep booking'}
          </button>
          {!blocked && (
            <button
              onClick={onConfirm}
              disabled={busy || isLoading}
              className="flex flex-1 items-center justify-center rounded-2xl bg-red-600 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : 'Cancel it'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One line of the cancellation breakdown. */
function Row({ label, value, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-[12px] ${strong ? 'font-bold text-[#0F172A]' : 'text-slate-500'}`}>{label}</span>
      <span className={`shrink-0 tabular-nums ${strong ? 'text-sm font-black text-emerald-700' : 'text-[12.5px] font-semibold text-slate-700'}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * The code the customer reads out when their device changes hands.
 *
 * A repair moves an expensive object between people, so the moment is proved
 * rather than asserted — and the customer needs the number in front of them
 * BEFORE the technician asks, not after a scramble through notifications.
 *
 * The server only ever returns the code for the step actually due, so there is
 * nothing here to leak: holding the return code while the device is still being
 * collected would defeat the point of having two.
 */
function HandoverCode({ booking }) {
  const closed = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED']
    .includes(booking.status);
  const { data, isLoading } = useRepairHandoverCodeQuery(booking._id, { skip: closed });

  if (closed) return null;
  if (isLoading) return null;
  if (!data?.code) return null;

  const COPY = {
    start: {
      title: 'Share this to start the repair',
      hint: 'Your technician needs this before any work begins.',
    },
    handover: {
      title: 'Share this when handing your device over',
      hint: 'Proof your device was collected — never give it before this is asked for.',
    },
    return: {
      title: 'Share this when you get your device back',
      hint: 'Proof the right person received it. Check the device before reading it out.',
    },
  }[data.kind] || { title: 'Your handover code', hint: 'Share this with your technician.' };

  return <HandoverCodeCard code={data.code} title={COPY.title} hint={COPY.hint} />;
}

/**
 * Rate the finished repair, once.
 *
 * Asked on the booking itself rather than in a popup that interrupts: the
 * customer is looking at the job they are rating, with the photos of the work
 * right above. A rating that can be rewritten is not a rating, so once it is
 * given the card becomes a record of what was said.
 */
/**
 * The service report — the findings, not the receipt.
 *
 * Opened as a blob in a new tab, exactly as the order invoice is, so the same
 * printable HTML works for saving, printing and forwarding without adding a
 * PDF dependency for one screen.
 */
function ServiceReport({ booking }) {
  const { accessToken: token } = useSelector(selectAuth);
  const [loading, setLoading] = useState(false);

  if (booking.status !== 'COMPLETED') return null;

  async function open() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/repair/bookings/${booking._id}/report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Report not available yet');
      const html = await res.text();
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(err.message || 'Could not load the report');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Service report</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
        What the technician found, what was done, and the before and after photos.
      </p>
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        View report
      </button>
    </div>
  );
}

function RateRepair({ booking }) {
  const [rate, { isLoading }] = useRateRepairBookingMutation();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');

  if (booking.status !== 'COMPLETED') return null;

  if (booking.ratedAt) {
    return (
      <div className="card">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your rating</p>
        <div className="mt-1.5 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={16}
              className={i <= booking.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}
            />
          ))}
        </div>
        {booking.ratingComment && (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">{booking.ratingComment}</p>
        )}
      </div>
    );
  }

  async function submit() {
    try {
      await rate({ id: booking._id, rating: stars, comment }).unwrap();
      toast.success('Thanks — that helps the next customer');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save your rating');
    }
  }

  return (
    <div className="card">
      <p className="text-sm font-bold text-[#0F172A]">How was the repair?</p>
      <p className="mt-0.5 text-[11.5px] text-slate-500">
        Your rating decides who we send to the next customer.
      </p>

      <div className="mt-3 flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" onClick={() => setStars(i)} className="p-0.5">
            <Star
              size={30}
              className={i <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}
            />
          </button>
        ))}
      </div>

      {stars > 0 && (
        <>
          <textarea
            className="input mt-3 w-full text-sm"
            rows={2}
            maxLength={1000}
            placeholder={stars <= 3 ? 'What went wrong?' : 'Anything worth mentioning? (optional)'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button onClick={submit} disabled={isLoading} className="btn-primary mt-2 w-full">
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : 'Submit rating'}
          </button>
        </>
      )}
    </div>
  );
}

/** Bookings still in flight get the live card; closed ones get a plain result. */
const ACTIVE_FOR_CUSTOMER = [
  'PENDING', 'CONFIRMED', 'PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED',
  'DIAGNOSING', 'QUOTE_PENDING', 'CUSTOMER_APPROVAL_PENDING', 'APPROVED', 'PICKUP_SCHEDULED',
  'DEVICE_PICKED_UP', 'AT_WORKSHOP', 'REPAIR_IN_PROGRESS', 'QA_PENDING', 'READY_FOR_RETURN',
  'OUT_FOR_RETURN',
];

export default function RepairBookingPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetRepairBookingQuery(id, { pollingInterval: 20000 });
  const [cancel, { isLoading: cancelling }] = useCancelRepairBookingMutation();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (isLoading) {
    return <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <Loader2 size={26} className="animate-spin text-zappy-500" />
    </div>;
  }

  const booking = data?.booking;
  if (!booking) {
    return <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-3">
      <p className="font-bold text-slate-700">Booking not found</p>
      <button onClick={() => nav('/repair')} className="btn-primary px-6">Book a repair</button>
    </div>;
  }

  const meta = STATUS_COPY[booking.status] || { label: booking.status, tone: 'slate', hint: '' };
  const quotes = data?.quotes || [];
  const pendingQuote = quotes.find((q) => q.status === 'sent' || q.status === 'clarification_requested');
  const snap = booking.priceSnapshot || {};
  /*
   * The SERVER decides whether this can still be cancelled.
   *
   * This used to be a hardcoded list of statuses here, and it had drifted from
   * the server's: DIAGNOSING, QUOTE_PENDING and PICKUP_SCHEDULED were missing,
   * so a customer whose pickup was scheduled saw no cancel button while the
   * API would have accepted the request without complaint. They had no way to
   * ask for something they were entitled to.
   *
   * The fee and the policy are the server's too — CancelSheet fetches the real
   * quote before anyone confirms.
   */
  const canCancel = !!data?.canCancel;

  async function doCancel() {
    try {
      const res = await cancel({ id, reason: 'Cancelled by customer' }).unwrap();
      setConfirmingCancel(false);
      // Say what it actually cost, rather than a bare "cancelled" — the
      // customer has just agreed to a number and deserves confirmation of it.
      toast.success(res?.cancellation?.feePaise > 0
        ? `Cancelled — ${rupees(res.cancellation.feePaise)} fee applied`
        : 'Booking cancelled');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not cancel');
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      {confirmingCancel && (
        <CancelSheet
          bookingId={id}
          busy={cancelling}
          onClose={() => setConfirmingCancel(false)}
          onConfirm={doCancel}
        />
      )}

      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => nav('/repair/bookings')} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <div>
          <p className="t-label">Repair</p>
          <p className="font-semibold text-[#0F172A]">{booking.reference}</p>
        </div>
      </div></header>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {/* Status, elapsed time, live map and stage copy — all in one card. */}
        <LiveStatusCard booking={booking} provider={data?.provider} />

        {/* Directly under the status, where the customer is already looking. */}
        <HandoverCode booking={booking} />

        {/* Proof of the work, before being asked to rate it. */}
        {booking.completionPhotos?.length > 0 && (
          <div className="card">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Photos of the work</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {booking.completionPhotos.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noreferrer" className="h-20 w-20 overflow-hidden rounded-xl bg-slate-100">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        <ServiceReport booking={booking} />
        <RateRepair booking={booking} />

        {/*
          * No tip card here yet, deliberately.
          *
          * TipCard posts to `POST /orders/:id/tip`, which has no server handler
          * — the button is dead on the order flow too. Mounting it on repairs
          * would move a broken feature rather than add a working one, so it
          * waits for the endpoint.
          */}

        {/* Closed bookings get no live card, so the outcome is stated here. */}
        {!ACTIVE_FOR_CUSTOMER.includes(booking.status) && (
          <div className="card">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${TONES[meta.tone]}`}>
              {meta.label}
            </span>
            {meta.hint && <p className="text-xs text-slate-500 mt-2">{meta.hint}</p>}
          </div>
        )}

        {pendingQuote && <QuoteCard quote={pendingQuote} onDecided={refetch} />}

        <div className="card space-y-2.5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Details</p>
          {[
            ['Device', `${booking.brandCode} ${booking.modelCode}`],
            ['Repair', booking.repairCode?.replace(/_/g, ' ') || 'Diagnosis first'],
            ['Service', (booking.serviceMode || '').replace(/_/g, ' ')],
            ['Address', booking.location?.address],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3">
              <span className="text-xs text-slate-500">{k}</span>
              <span className="text-sm font-semibold text-[#0F172A] text-right capitalize">{v || '—'}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[#0F172A]">
              {snap.isEstimate ? 'Estimated total' : 'Total'}
            </span>
            <span className="text-2xl font-black text-[#0F172A]">{rupees(snap.totalPaise)}</span>
          </div>
          {snap.isEstimate && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700 mt-2">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              This is an estimate. The final price is confirmed by a quote you approve.
            </p>
          )}
          {snap.warrantyDays > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold mt-2">
              <ShieldCheck size={12} /> {snap.warrantyDays}-day warranty
            </p>
          )}

          {/*
            How this gets paid.
            Cash is the norm for repair work here, so the screen says plainly
            what to hand over and when — a customer who does not know whether
            to keep notes ready is a customer the technician argues with on the
            doorstep.
          */}
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            {booking.paymentStatus === 'paid' ? (
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-700">
                <ShieldCheck size={13} /> Paid
                {booking.cashCollectedAt ? ' in cash' : ''}
              </p>
            ) : booking.paymentMethod === 'cash' ? (
              <>
                <p className="text-[12px] font-bold text-[#0F172A]">Pay in cash when the job is done</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  Hand {rupees(snap.totalPaise)} to the technician after they finish. Nothing is
                  charged before that, and they cannot close the job without recording it.
                </p>
              </>
            ) : snap.isEstimate && booking.status !== 'APPROVED' ? (
              <p className="text-[12px] font-semibold text-slate-600">
                You pay online once you approve the technician's quote.
              </p>
            ) : ['CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED', 'REJECTED'].includes(booking.status) ? (
              <p className="text-[12px] font-semibold text-slate-600">Nothing to pay</p>
            ) : (
              <>
                <p className="text-[12px] font-bold text-[#0F172A]">Online payment pending</p>
                <p className="mt-0.5 mb-2 text-[11px] leading-relaxed text-slate-500">
                  If online payment is down, pay the technician in cash instead — they record it.
                </p>
                <PayNowButton
                  bookingSource="repair"
                  bookingId={booking._id}
                  amountLabel={rupees(snap.totalPaise)}
                  label="Repair booking"
                />
              </>
            )}
          </div>
        </div>

        {quotes.length > 0 && (
          <div className="card">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Quote history</p>
            <div className="space-y-1.5">
              {quotes.map((q) => (
                <div key={q._id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Revision {q.revision} · {q.status.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-[#0F172A]">{rupees(q.totalPaise)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {canCancel && (
          <button onClick={() => setConfirmingCancel(true)} disabled={cancelling}
            className="w-full text-sm font-semibold text-red-600 py-3">
            {cancelling ? 'Cancelling…' : 'Cancel booking'}
          </button>
        )}
      </div>
    </div>
  );
}
