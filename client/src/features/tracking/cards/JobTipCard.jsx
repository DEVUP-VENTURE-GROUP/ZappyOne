import { useState } from 'react';
import toast from 'react-hot-toast';
import { Heart, Loader2 } from 'lucide-react';
import { useTipJobMutation } from '@shared/services/api';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

/**
 * After the job: a thank-you that goes entirely to the provider. From the
 * wallet it reaches them now; "I gave it in cash" just tells them. Once per
 * job. Amounts are set in Admin → Economics → Boost & tips.
 */
export default function JobTipCard({ jobId, tip, name, onTipped }) {
  const [tipJob, { isLoading }] = useTipJobMutation();
  const [amount, setAmount] = useState(null);
  const [message, setMessage] = useState('');

  if (tip?.given) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-100">
        <Heart size={18} className="text-rose-500" />
        <p className="text-[13px] text-slate-600">You tipped {rupees(tip.given.paise)}{tip.given.method === 'cash' ? ' in cash' : ''}. Thank you.</p>
      </div>
    );
  }
  if (!tip?.available || !tip.options.length) return null;

  async function send(method) {
    try {
      const r = await tipJob({ id: jobId, amountPaise: amount * 100, method, message: message.trim() }).unwrap();
      toast.success(r.message);
      onTipped?.();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send the tip');
    }
  }

  return (
    <div className="rounded-2xl bg-white px-4 py-3.5 ring-1 ring-slate-100">
      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-navy"><Heart size={16} className="text-rose-500" /> Thank {name || 'them'} with a tip</p>
      <p className="mt-0.5 text-[12.5px] text-slate-500">All of it goes to them.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {tip.options.map((r) => (
          <button key={r} type="button" onClick={() => setAmount(r)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${amount === r ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-700'}`}>
            ₹{r}
          </button>
        ))}
      </div>
      {amount && (
        <div className="mt-3 space-y-2">
          <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder="Say thanks (optional)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zappy-100" />
          <div className="flex gap-2">
            <button type="button" onClick={() => send('wallet')} disabled={isLoading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zappy-600 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
              {isLoading && <Loader2 size={14} className="animate-spin" />} Tip ₹{amount} from wallet
            </button>
            <button type="button" onClick={() => send('cash')} disabled={isLoading}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-[13px] font-semibold text-slate-700 disabled:opacity-50">
              I gave it in cash
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
