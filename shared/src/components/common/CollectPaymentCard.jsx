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

/**
 * What the provider does about money at the end of a job.
 *   paid                → confirmation
 *   cash                → "collect ₹X", then record it
 *   online, not paid    → "waiting for ₹X online", with cash as the fallback
 * The job cannot close until one of these has happened, so this sits right
 * where the provider finishes the work. A tip the customer put on the bill is
 * inside amountPaise and called out (tipPaise): it is all theirs.
 */
export default function CollectPaymentCard({ amountPaise, paymentMethod, paid, collecting, onCollect, what = 'payment', tipPaise = 0, jobId = null }) {
  if (!amountPaise || amountPaise <= 0) return null;
  const amount = formatPaise(amountPaise);
  const tipLine = tipPaise > 0 && (
    <p className="mt-1.5 flex items-center gap-1.5 rounded-xl bg-rose-50 px-2.5 py-1.5 text-[12px] font-bold text-rose-700">
      <Heart size={13} className="fill-rose-500 text-rose-500" /> Includes a {formatPaise(tipPaise)} tip from the customer. All yours.
    </p>
  );

  if (paid) {
    return (
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
          <Check size={15} /> {amount} {paymentMethod === 'cash' ? 'collected in cash' : 'paid online'}
        </p>
        {tipLine}
      </div>
    );
  }

  const cash = paymentMethod === 'cash';
  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-4">
      <p className="text-sm font-bold text-[#0F172A]">{cash ? `Collect ${amount} in cash` : `Waiting for ${amount} online`}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
        {cash
          ? `Take the ${what} from the customer, then record it here. The platform's share is deducted from your wallet.`
          : 'The customer chose to pay online and can pay from their booking screen. If they cannot, take cash and record it here.'}
      </p>
      {tipLine}
      <button
        type="button"
        onClick={onCollect}
        disabled={collecting}
        className={`w-full mt-2.5 rounded-2xl font-bold py-3 disabled:opacity-50 ${cash ? 'bg-[#0F172A] text-white' : 'border-2 border-slate-300 bg-white text-[#0F172A]'}`}
      >
        {collecting
          ? <span className="inline-flex items-center gap-1.5"><Loader2 size={15} className="animate-spin" /> Recording…</span>
          : `I've collected ${amount} in cash`}
      </button>
      {cash && jobId && <CashRefusedControl jobId={jobId} />}
    </div>
  );
}
