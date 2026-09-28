import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Plus, Trash2, Check, X, ClipboardCheck,
  AlertTriangle, FileText, Wrench, ShieldCheck, Navigation,
} from 'lucide-react';
import {
  useGetRepairBookingQuery, useTransitionRepairBookingMutation, useCollectRepairCashMutation,
  useSubmitRepairQuoteMutation, useRepairQaChecklistQuery, useSubmitRepairQaMutation,
} from '../../services/api';
import toast from 'react-hot-toast';
import { formatPaise } from '../../utils/money';
import { usePublishRepairLocation, MOVING_STATUSES } from '../../hooks/useRepairTracking';
import { useVerifyRepairHandoverCodeMutation } from '../../services/api';
import OtpEntry from '../../components/common/OtpEntry';
import ArrivalProximity, { useArrivalProximity } from '../../components/common/ArrivalProximity';
import ProofPhotos, { readyKeys, photosSettled } from '../../components/common/ProofPhotos';
import { useAttachRepairCompletionPhotosMutation } from '../../services/api';

/**
 * Worker's repair job screen.
 *
 * Mirrors the state machine rather than inventing its own flow: the primary
 * button is always the single next legal transition, so a technician cannot be
 * offered an action the server will reject.
 *
 * Two gates are surfaced honestly rather than hidden:
 *   - A quote can only be raised once the device has been seen.
 *   - Completion is blocked until every REQUIRED QA item passes (§27), and the
 *     screen says which ones failed instead of just refusing.
 */

const rupees = formatPaise;

/**
 * Which handover code, if any, the NEXT step demands.
 *
 * Mirrors OTP_GATES in the server's handover.service.js. Duplicated here on
 * purpose and deliberately narrow: the server is the authority and refuses the
 * transition regardless, but a technician should meet the code box BEFORE
 * tapping a button that would be rejected — being told "ask for the code" after
 * the fact is how somebody ends up standing in a doorway retrying.
 */
function gateFor(nextStatus, serviceMode) {
  const gates = {
    REPAIR_IN_PROGRESS: ['doorstep'],
    DEVICE_PICKED_UP: ['pickup_repair'],
    COMPLETED: ['pickup_repair', 'workshop'],
  };
  const kind = {
    REPAIR_IN_PROGRESS: 'start',
    DEVICE_PICKED_UP: 'handover',
    COMPLETED: 'return',
  }[nextStatus];

  if (!kind) return null;
  return gates[nextStatus].includes(serviceMode) ? kind : null;
}

const GATE_COPY = {
  start: { title: 'Code to start work', hint: 'Ask the customer for their 6-digit code' },
  handover: { title: 'Code to collect the device', hint: 'The customer reads this out as they hand it over' },
  return: { title: 'Code to hand the device back', hint: 'Let them check the device first, then ask' },
};

/**
 * The single next step, derived from the status AND how the job is being done.
 *
 * Two holes this closes, both of which stranded a technician mid-job:
 *
 * 1. DIAGNOSING had no entry at all. The server allows
 *    DIAGNOSING → REPAIR_IN_PROGRESS, but the screen offered only "Raise a
 *    quote" — so on a job where the price was already agreed, the technician
 *    finished diagnosing and had nowhere to go.
 *
 * 2. The map ignored serviceMode, so a PICKUP job was driven like a doorstep
 *    visit: "Start trip" then "I've arrived", skipping the custody chain
 *    (scheduled → collected → at workshop → … → out for return) that exists
 *    precisely so a device leaving the customer's hands is accounted for.
 *
 * Every status the server can legally move on from now has a button. Cross-check
 * against TRANSITIONS in booking.model.js when adding a status.
 */
function nextAction(status, serviceMode) {
  const collecting = serviceMode === 'pickup_repair';

  const map = {
    PROVIDER_ASSIGNED: { to: 'WORKER_ACCEPTED', label: 'Accept job' },

    // A collected device is scheduled for pickup, not travelled to.
    WORKER_ACCEPTED: collecting
      ? { to: 'PICKUP_SCHEDULED', label: 'Schedule the pickup' }
      : { to: 'ON_THE_WAY', label: 'Start trip' },

    ON_THE_WAY: { to: 'ARRIVED', label: "I've arrived" },
    ARRIVED: { to: 'DIAGNOSING', label: 'Start diagnosis' },

    // The missing one. Raising a quote stays available alongside it, for when
    // the price has to change.
    DIAGNOSING: { to: 'REPAIR_IN_PROGRESS', label: 'Start repair' },

    APPROVED: { to: 'REPAIR_IN_PROGRESS', label: 'Start repair' },
    REPAIR_IN_PROGRESS: { to: 'QA_PENDING', label: 'Finish repair — run QA' },

    // A collected device is not finished until it is back with its owner.
    QA_PENDING: collecting
      ? { to: 'READY_FOR_RETURN', label: 'Ready to return' }
      : { to: 'COMPLETED', label: 'Complete job' },

    PICKUP_SCHEDULED: { to: 'DEVICE_PICKED_UP', label: 'Device collected' },
    DEVICE_PICKED_UP: { to: 'AT_WORKSHOP', label: 'Arrived at workshop' },
    AT_WORKSHOP: { to: 'DIAGNOSING', label: 'Start diagnosis' },
    READY_FOR_RETURN: { to: 'OUT_FOR_RETURN', label: 'Out for return' },
    OUT_FOR_RETURN: { to: 'COMPLETED', label: 'Delivered — complete' },
  };
  return map[status] || null;
}

const QUOTABLE = ['ARRIVED', 'DIAGNOSING', 'AT_WORKSHOP', 'REPAIR_IN_PROGRESS'];

/* ─── Quote builder ────────────────────────────────────────────────────── */

/**
 * Raising a price for work the customer has not yet agreed to.
 *
 * `additional` is the mid-repair case: the device is open and something else
 * has turned up. It is framed differently on purpose — a technician who finds a
 * second fault is doing the right thing, and the alternatives are quietly
 * fixing it and arguing about the bill, or quietly not fixing it at all.
 */
function QuoteBuilder({ bookingId, repairCode, additional = false, onSent, onCancel }) {
  const [summary, setSummary] = useState('');
  const [warrantyDays, setWarrantyDays] = useState(90);
  const [items, setItems] = useState([{ kind: 'part', label: '', unitPricePaise: '', quantity: 1 }]);
  const [submit, { isLoading }] = useSubmitRepairQuoteMutation();

  const total = items.reduce((sum, i) => sum + (Number(i.unitPricePaise) || 0) * (Number(i.quantity) || 1), 0);

  function setItem(idx, patch) {
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function send() {
    const clean = items
      .filter((i) => i.label.trim() && Number(i.unitPricePaise) > 0)
      .map((i) => ({
        kind: i.kind,
        label: i.label.trim(),
        quantity: Number(i.quantity) || 1,
        unitPricePaise: Math.round(Number(i.unitPricePaise)),
      }));

    if (!summary.trim()) return toast.error('Describe what you found');
    if (!clean.length) return toast.error('Add at least one priced line');

    try {
      await submit({
        id: bookingId,
        diagnosisSummary: summary.trim(),
        repairCode,
        warrantyDays: Number(warrantyDays) || 0,
        items: clean,
        isAdditional: additional,
        ...(additional ? { foundNote: summary.trim() } : {}),
      }).unwrap();
      toast.success(additional
        ? 'Sent — the customer decides before you carry on'
        : 'Quote sent — waiting for the customer to approve');
      onSent();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send the quote');
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-bold text-sm text-[#0F172A]">
          {additional ? 'Extra work found' : 'Raise a quote'}
        </p>
        <button onClick={onCancel} className="text-slate-400"><X size={17} /></button>
      </div>

      {additional && (
        <p className="rounded-xl bg-amber-50 p-2.5 text-[11.5px] leading-relaxed text-amber-800">
          Include everything the customer is paying in total, not just the new part — they approve
          one figure. Work stops until they answer, and the clock pauses while it does.
        </p>
      )}

      <div>
        <label className="text-[12px] font-bold text-slate-700 block mb-1.5">What did you find?</label>
        <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)}
          placeholder="e.g. Panel and digitizer both failed; frame is intact."
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 resize-none" />
        <p className="text-[11px] text-slate-400 mt-1">The customer sees this word for word.</p>
      </div>

      <div className="space-y-2">
        <label className="text-[12px] font-bold text-slate-700 block">Charges</label>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <select value={item.kind} onChange={(e) => setItem(idx, { kind: e.target.value })}
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs w-24 outline-none">
              {['part', 'labour', 'consumable', 'travel', 'pickup', 'return', 'other'].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <input value={item.label} onChange={(e) => setItem(idx, { label: e.target.value })}
              placeholder="Description" className="input text-sm flex-1" />
            <input type="number" value={item.unitPricePaise}
              onChange={(e) => setItem(idx, { unitPricePaise: e.target.value })}
              placeholder="paise" className="input text-sm w-28" />
            {items.length > 1 && (
              <button onClick={() => setItems((l) => l.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-red-500 shrink-0"><Trash2 size={15} /></button>
            )}
          </div>
        ))}
        <button onClick={() => setItems((l) => [...l, { kind: 'part', label: '', unitPricePaise: '', quantity: 1 }])}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
          <Plus size={13} /> Add line
        </button>
      </div>

      <div>
        <label className="text-[12px] font-bold text-slate-700 block mb-1.5">Warranty (days)</label>
        <input type="number" value={warrantyDays} onChange={(e) => setWarrantyDays(e.target.value)}
          className="input text-sm w-32" />
      </div>

      <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
        <span className="text-sm font-semibold text-slate-600">Subtotal (before tax)</span>
        <span className="text-lg font-black text-[#0F172A]">{rupees(total)}</span>
      </div>

      <button onClick={send} disabled={isLoading} className="btn-primary w-full">
        {isLoading ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : 'Send quote to customer'}
      </button>
    </div>
  );
}

/* ─── QA checklist ─────────────────────────────────────────────────────── */

function QAPanel({ bookingId, onDone }) {
  const { data, isLoading } = useRepairQaChecklistQuery(bookingId);
  const [submit, { isLoading: submitting }] = useSubmitRepairQaMutation();
  const [results, setResults] = useState({});

  if (isLoading) return <div className="card"><Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" /></div>;

  const checklist = data?.checklist;
  if (!checklist) return null;

  const items = checklist.items || [];
  const requiredUntested = items.filter((i) => i.required && !results[i.code]);
  const failedRequired = items.filter((i) => i.required && results[i.code] === 'fail');

  async function send() {
    try {
      const res = await submit({
        id: bookingId,
        stage: 'after',
        checklistCode: checklist.code,
        results: items.map((i) => ({
          itemCode: i.code, label: i.label, required: i.required,
          result: results[i.code] || 'not_tested',
        })),
      }).unwrap();

      if (res.passed) {
        toast.success('QA passed — you can complete the job');
        onDone();
      } else {
        toast.error('QA failed — fix the failed checks and re-run');
      }
    } catch (err) {
      toast.error(err?.data?.error || 'Could not submit QA');
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={16} className="text-indigo-600" />
        <p className="font-bold text-sm text-[#0F172A]">{checklist.name}</p>
      </div>
      <p className="text-[11px] text-slate-400 -mt-1">
        Required checks must pass before the job can be completed.
      </p>

      <div className="space-y-1.5">
        {items.map((item) => {
          const val = results[item.code];
          return (
            <div key={item.code} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#0F172A]">{item.label}</p>
                {item.required && <span className="text-[10px] font-bold text-red-500">REQUIRED</span>}
              </div>
              <div className="flex gap-1 shrink-0">
                {[['pass', Check, 'emerald'], ['fail', X, 'red'], ['not_applicable', null, 'slate']].map(([r, Icon, tone]) => (
                  <button key={r} onClick={() => setResults((s) => ({ ...s, [item.code]: r }))}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                      val === r
                        ? tone === 'emerald' ? 'bg-emerald-600 text-white'
                          : tone === 'red' ? 'bg-red-600 text-white' : 'bg-slate-600 text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                    {Icon ? <Icon size={11} /> : 'N/A'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {failedRequired.length > 0 && (
        <div className="flex items-start gap-2 bg-red-50 rounded-xl px-3 py-2">
          <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">
            {failedRequired.length} required check{failedRequired.length > 1 ? 's' : ''} failed. Completion is blocked until resolved.
          </p>
        </div>
      )}

      <button onClick={send} disabled={submitting || requiredUntested.length > 0} className="btn-primary w-full">
        {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
          : requiredUntested.length > 0 ? `${requiredUntested.length} required check(s) left`
            : 'Submit QA'}
      </button>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export default function WorkerRepairJobPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetRepairBookingQuery(id, { pollingInterval: 20000 });
  const [transition, { isLoading: moving }] = useTransitionRepairBookingMutation();
  const [collectCash, { isLoading: collecting }] = useCollectRepairCashMutation();
  const [showQuote, setShowQuote] = useState(false);
  const [otp, setOtp] = useState('');
  const [photos, setPhotos] = useState([]);
  const [attachPhotos] = useAttachRepairCompletionPhotosMutation();
  const [verifyCode, { isLoading: verifying }] = useVerifyRepairHandoverCodeMutation();

  /**
   * Share position for exactly as long as the trip lasts.
   *
   * Driven off the booking's own status rather than a toggle, so it starts when
   * they press "Start trip" and stops the moment they arrive — nobody has to
   * remember to turn it off, and it cannot be left running overnight. The hook
   * runs before the early returns below because hooks must.
   */
  const status = data?.booking?.status;
  const onTrip = MOVING_STATUSES.includes(status);
  const sharingLocation = usePublishRepairLocation(id, onTrip);

  /**
   * Proximity, computed up here for the SAME reason — a hook must run on every
   * render, and there are early returns below.
   *
   * It reads `data?.booking` rather than the post-guard `booking`, so it is
   * evaluated before the loading/not-found returns and its hook count never
   * changes. Moving it below those returns is what threw "Rendered more hooks
   * than during the previous render" the instant the booking finished loading.
   */
  const headingToCustomer = status === 'ON_THE_WAY';
  const customerCoords = data?.booking?.location?.coordinates;
  const proximity = useArrivalProximity(customerCoords, { enabled: headingToCustomer });

  if (isLoading) {
    return <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <Loader2 size={26} className="animate-spin text-indigo-500" />
    </div>;
  }

  const booking = data?.booking;
  if (!booking) {
    return <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-3">
      <p className="font-bold text-slate-700">Job not found</p>
      <button onClick={() => nav('/worker')} className="btn-primary px-6">Back to dashboard</button>
    </div>;
  }

  const action = nextAction(booking.status, booking.serviceMode);

  /**
   * Evidence is gathered at QA, while the device is still open on the bench —
   * not remembered afterwards from the van.
   */
  const wantsPhotos = ['QA_PENDING', 'READY_FOR_RETURN'].includes(booking?.status);
  // A photo still uploading, or one that failed, is not evidence.
  const photosBlocked = wantsPhotos && !photosSettled(photos);

  // `headingToCustomer`, `customerCoords` and `proximity` are computed above the
  // early returns (hooks must run every render). Only the plain derived value
  // is left here.
  const tooFarToArrive = headingToCustomer && !proximity.withinRadius;

  // What the next move needs, and whether it has already been given.
  const gateKind = action ? gateFor(action.to, booking.serviceMode) : null;
  const gatePassed = gateKind ? !!booking.otpVerified?.[`${gateKind}At`] : true;

  async function confirmCode() {
    try {
      await verifyCode({ id, kind: gateKind, code: otp }).unwrap();
      setOtp('');
      toast.success('Code confirmed');
      refetch();
    } catch (err) {
      // The server's words — it knows whether this was wrong, expired, or
      // never issued, and each needs a different response from the technician.
      toast.error(err?.data?.error || 'That code did not work');
      setOtp('');
    }
  }

  /**
   * Money is due once the repair is finished, not when it is promised.
   *
   * QA_PENDING is the earliest honest point: the work is done and being checked,
   * so the figure is real. Anything before that is an estimate the technician
   * has not yet tested against the actual device.
   */
  const readyForPayment = ['QA_PENDING', 'READY_FOR_RETURN', 'OUT_FOR_RETURN', 'COMPLETED']
    .includes(booking.status) || booking.paymentStatus === 'paid';
  const snap = booking.priceSnapshot || {};
  const quotes = data?.quotes || [];
  // Stored as { raw, transcript }; older bookings have neither.
  const transcript = booking.diagnosticAnswers?.transcript || [];
  const awaitingCustomer = booking.status === 'CUSTOMER_APPROVAL_PENDING';

  async function collect() {
    try {
      const res = await collectCash(id).unwrap();
      toast.success(res.alreadyPaid ? 'Already recorded' : 'Payment recorded');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not record the payment');
    }
  }

  async function move(to) {
    try {
      // Attach whatever is genuinely in storage before the status moves on.
      const keys = readyKeys(photos);
      if (keys.length) await attachPhotos({ id, photos: keys }).unwrap();
      await transition({ id, status: to }).unwrap();
      toast.success('Updated');
      refetch();
    } catch (err) {
      // Surface the server's real reason — e.g. QA still failing.
      toast.error(err?.data?.error || 'Could not update this job');
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => nav('/worker')} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <div>
          <p className="t-label">Repair job</p>
          <p className="font-semibold text-[#0F172A]">{booking.reference}</p>
        </div>
      </div></header>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {onTrip && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50 p-3">
            <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
              {sharingLocation && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              )}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                sharingLocation ? 'bg-blue-600' : 'bg-slate-300'
              }`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-bold text-blue-900">
                {sharingLocation === 'sharing' ? 'Customer can see you on the map'
                  : sharingLocation === 'denied' ? 'Location access is blocked'
                    : 'Getting your location…'}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-blue-700">
                {sharingLocation === 'sharing'
                  ? 'It stops by itself the moment you mark this job as arrived.'
                  : sharingLocation === 'denied'
                    ? 'Allow location for this site in your browser so the customer can follow your trip.'
                    : 'Waiting for the first GPS fix — this can take a few seconds.'}
              </p>
            </div>
            {customerCoords?.length === 2 && (
              <button
                onClick={() => window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${customerCoords[1]},${customerCoords[0]}`,
                  '_blank', 'noopener',
                )}
                className="flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
              >
                <Navigation size={11} /> Directions
              </button>
            )}
          </div>
        )}
        <div className="card">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Status</p>
          <p className="font-bold text-[#0F172A] mt-1 capitalize">{booking.status.replace(/_/g, ' ').toLowerCase()}</p>
        </div>

        {/*
          Taking the money is the LAST step, not the first.

          This block used to sit at the top of the screen from the moment a job
          was accepted — "Collect ₹1,638 in cash" with a button to confirm it,
          before the technician had left the shop. That invites recording money
          nobody has handed over, on an estimate that has not survived contact
          with the device. It now appears only once the work is finished and the
          customer genuinely owes something.

          The job still cannot be completed until this is recorded, because
          completion bills the provider their commission on the basis that they
          were paid.
        */}
        {readyForPayment && booking.paymentMethod === 'cash' && (snap.totalPaise || 0) > 0 && (
          <div className={`card ${booking.paymentStatus === 'paid' ? 'ring-emerald-200 bg-emerald-50/40' : 'ring-amber-200 bg-amber-50/40'}`}>
            {booking.paymentStatus === 'paid' ? (
              <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                <Check size={15} /> {rupees(snap.totalPaise)} collected in cash
              </p>
            ) : (
              <>
                <p className="text-sm font-bold text-[#0F172A]">Collect {rupees(snap.totalPaise)} in cash</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                  Take the payment from the customer, then record it here. Your commission is
                  deducted from your wallet afterwards.
                </p>
                <button
                  onClick={collect}
                  disabled={collecting}
                  className="btn-primary w-full mt-2.5"
                >
                  {collecting
                    ? <><Loader2 size={15} className="animate-spin" /> Recording…</>
                    : <>I've collected {rupees(snap.totalPaise)}</>}
                </button>
              </>
            )}
          </div>
        )}



        <div className="card space-y-2.5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Job</p>
          {[
            ['Device', `${booking.brandCode} ${booking.modelCode}`],
            /*
             * The powertrain, where the vertical has one.
             *
             * Not decoration: a CNG Nexon and a petrol Nexon need different
             * parts and different qualifications, and arriving with the wrong
             * assumption wastes the trip. Hidden entirely where it does not
             * apply rather than showing an empty row.
             */
            ...(booking.fuelType ? [['Fuel', booking.fuelType]] : []),
            ...(booking.configurationLabel ? [['Build', booking.configurationLabel]] : []),
            ['Reported', (booking.problemCodes || []).join(', ').replace(/_/g, ' ') || '—'],
            ['Repair', booking.repairCode?.replace(/_/g, ' ') || 'Diagnosis first'],
            ['Mode', (booking.serviceMode || '').replace(/_/g, ' ')],
            ['Address', booking.location?.address],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3">
              <span className="text-xs text-slate-500">{k}</span>
              <span className="text-sm font-semibold text-[#0F172A] text-right capitalize">{v || '—'}</span>
            </div>
          ))}
        </div>

        {/*
          * What the customer was actually asked, and what they said.
          *
          * This showed one generated sentence — "Based on your answers, the
          * likely repair is Screen Glass Replacement" — which tells a
          * technician nothing they could not guess from the repair code. The
          * useful part is the conversation: is the glass cracked or is the
          * display black, did it get wet, does the touch still respond. Those
          * answers decide which part to bring.
          */}
        {(transcript.length > 0 || booking.diagnosisSummary) && (
          <div className="card">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              What the customer told us
            </p>

            {transcript.length > 0 ? (
              <ol className="space-y-2">
                {transcript.map((t, i) => (
                  <li key={t.questionId || i} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10.5px] font-black text-slate-500">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11.5px] leading-snug text-slate-500">{t.question}</span>
                      <span className="mt-0.5 block text-[13px] font-bold leading-snug text-[#0F172A]">
                        {t.answer}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[11.5px] leading-relaxed text-amber-600">
                The step-by-step answers were not recorded for this booking.
              </p>
            )}

            {booking.diagnosisSummary && (
              <p className="mt-2.5 border-t border-slate-100 pt-2.5 text-[11.5px] leading-relaxed text-slate-500">
                {booking.diagnosisSummary}
              </p>
            )}
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[#0F172A]">{snap.isEstimate ? 'Estimate' : 'Agreed price'}</span>
            <span className="text-xl font-black text-[#0F172A]">{rupees(snap.totalPaise)}</span>
          </div>
        </div>

        {awaitingCustomer && (
          <div className="card bg-amber-50 ring-amber-200 flex items-start gap-2.5">
            <FileText size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-amber-900">Waiting for customer approval</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Do not start work until they approve the quote.
              </p>
            </div>
          </div>
        )}

        {quotes.length > 0 && (
          <div className="card">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Quotes raised</p>
            {quotes.map((q) => (
              <div key={q._id} className="flex items-center justify-between text-xs py-1">
                <span className="text-slate-500">r{q.revision} · {q.status.replace(/_/g, ' ')}</span>
                <span className="font-semibold text-[#0F172A]">{rupees(q.totalPaise)}</span>
              </div>
            ))}
          </div>
        )}

        {showQuote ? (
          <QuoteBuilder
            bookingId={id}
            repairCode={booking.repairCode || 'display_assembly_replacement'}
            additional={showQuote === 'additional'}
            onSent={() => { setShowQuote(false); refetch(); }}
            onCancel={() => setShowQuote(false)}
          />
        ) : QUOTABLE.includes(booking.status) && (
          booking.status === 'REPAIR_IN_PROGRESS' ? (
            /*
              Mid-repair the device is already open, so the honest button is not
              "raise a quote" — it is "I have found something else", which is
              what actually happened and what the customer will be asked about.
            */
            <button onClick={() => setShowQuote('additional')}
              className="w-full flex items-center justify-center gap-2 bg-white ring-1 ring-amber-300 text-amber-700 font-bold text-sm py-3 rounded-xl">
              <AlertTriangle size={15} /> I've found another problem
            </button>
          ) : (
            <button onClick={() => setShowQuote(true)}
              className="w-full flex items-center justify-center gap-2 bg-white ring-1 ring-indigo-200 text-indigo-700 font-bold text-sm py-3 rounded-xl">
              <FileText size={15} /> Raise a quote
            </button>
          )
        )}

        {booking.status === 'QA_PENDING' && <QAPanel bookingId={id} onDone={refetch} />}

        {/*
          * The code box stands between the technician and the button.
          *
          * The server refuses the move without it either way, but discovering
          * that by tapping and being rejected is a bad minute for two people
          * standing in a doorway. Once accepted the box disappears and the
          * normal button returns.
          */}
        {wantsPhotos && (
          <div className="card">
            <ProofPhotos
              photos={photos}
              onChange={setPhotos}
              folder="order-proof"
              title="Photos of the finished repair"
              hint="The customer sees these. They are also your evidence if the work is questioned later."
            />
          </div>
        )}

        {/* How close they are, while they are on their way. */}
        {headingToCustomer && <ArrivalProximity metres={proximity.metres} />}

        {action && gateKind && !gatePassed && (
          <div className="card ring-amber-200">
            <OtpEntry
              value={otp}
              onChange={setOtp}
              title={GATE_COPY[gateKind].title}
              hint={GATE_COPY[gateKind].hint}
            />
            <button
              onClick={confirmCode}
              disabled={otp.length < 6 || verifying}
              className="btn-primary mt-2 w-full disabled:opacity-50"
            >
              {verifying
                ? <><Loader2 size={15} className="animate-spin" /> Checking…</>
                : 'Confirm code'}
            </button>
          </div>
        )}

        {action && (
          <button
            onClick={() => move(action.to)}
            disabled={moving || (gateKind && !gatePassed) || tooFarToArrive || photosBlocked}
            className="btn-primary w-full disabled:opacity-40"
          >
            {moving ? <><Loader2 size={15} className="animate-spin" /> Updating…</> : action.label}
          </button>
        )}
      </div>
    </div>
  );
}
