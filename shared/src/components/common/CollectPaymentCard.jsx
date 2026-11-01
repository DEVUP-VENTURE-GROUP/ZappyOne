import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Loader2, Heart } from 'lucide-react';
import { formatPaise } from '../../utils/money';
import { useReportCashRefusedMutation } from '../../services/api';

// "Customer did not pay", with a confirm step; the same control on every kind of job (server: jobs/give-back reportCashRefused).
export function CashRefusedControl({ jobId }) {
  const [asking, setAsking] = useState(false);
  const [report, { isLoading }] = useReportCashRefusedMutation();
  async function send() {
    try { toast.success((await report({ id: jobId }).unwrap()).message); setAsking(false); }
    catch (err) { toast.error(err?.data?.error || 'Could not send the report'); }
  }
  if (!asking) {
    return <button type="button" onClick={() => setAsking(true)} className="mt-2 w-full text-center text-[12.5px] font-semibold text-slate-500 hover:text-red-600">Customer did not pay</button>;
  }
  return (
    <div className="mt-2 rounded-xl bg-red-50 p-2.5 text-[12.5px] text-red-800">
      <p className="font-semibold">Report that the customer did not pay? They are told, their next booking waits until it is paid, and ZappyOne follows up.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={send} disabled={isLoading} className="rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white disabled:opacity-60">Yes, report</button>
        <button type="button" onClick={() => setAsking(false)} className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-red-200">Cancel</button>
      </div>
    </div>
  );
}

const timeOf = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/**
 * The money step at the end of every job: the customer pays the pro directly
 * (UPI to the pro's own ID, or cash), the customer may tap "I've paid" (claim),
 * and the pro taps Received once the money is really in hand.
 */
export default function CollectPaymentCard({ amountPaise, paymentMethod, paid, collecting, onCollect, tipPaise = 0, carriedPaise = 0, jobId = null, claim = null }) {
  if (!amountPaise || amountPaise <= 0) return null;
  const amount = formatPaise(amountPaise);
  const tipLine = tipPaise > 0 && (
    <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-rose-50 px-2.5 py-1.5 text-[12.5px] font-semibold text-rose-700">
      <Heart size={13} className="fill-rose-500 text-rose-500" /> Includes a {formatPaise(tipPaise)} tip from the customer. All yours.
    </p>
  );

  if (paid) {
    const how = paymentMethod === 'online' ? 'paid online' : claim?.method === 'upi' ? 'received by UPI' : 'received';
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="flex items-center gap-1.5 text-[15px] font-bold text-green-800"><Check size={16} /> {amount} {how}</p>
        {tipLine}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-[17px] font-extrabold text-ink-900">Collect {amount}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500">
        The customer pays you by UPI or cash. Tap Received once the money is with you.
        {carriedPaise > 0 && ` It includes ${formatPaise(carriedPaise)} they owed from an earlier cancelled booking.`}
      </p>
      {claim?.method && (
        <p className="mt-2.5 rounded-xl bg-zappy-50 px-3 py-2 text-[13px] font-semibold text-zappy-800">
          {claim.method === 'upi'
            ? `The customer says they paid ${amount} by UPI at ${timeOf(claim.at)}. Check your UPI app first.`
            : `The customer is paying ${amount} in cash.`}
        </p>
      )}
      {tipLine}
      <button type="button" onClick={onCollect} disabled={collecting} className="btn-primary mt-3 h-12 w-full">
        {collecting ? <><Loader2 size={15} className="animate-spin" /> Recording</> : `Received ${amount}`}
      </button>
      {jobId && <CashRefusedControl jobId={jobId} />}
    </div>
  );
}
