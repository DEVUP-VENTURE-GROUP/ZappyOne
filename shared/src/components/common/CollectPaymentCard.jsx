import { Check, Loader2 } from 'lucide-react';
import { formatPaise } from '../../utils/money';

/**
 * What the provider does about money at the end of a job.
 *   paid                → confirmation
 *   cash                → "collect ₹X", then record it
 *   online, not paid    → "waiting for ₹X online", with cash as the fallback
 * The job cannot close until one of these has happened, so this sits right
 * where the provider finishes the work.
 */
export default function CollectPaymentCard({ amountPaise, paymentMethod, paid, collecting, onCollect, what = 'payment' }) {
  if (!amountPaise || amountPaise <= 0) return null;
  const amount = formatPaise(amountPaise);

  if (paid) {
    return (
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
          <Check size={15} /> {amount} {paymentMethod === 'cash' ? 'collected in cash' : 'paid online'}
        </p>
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
    </div>
  );
}
