import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Heart, Loader2, Receipt, Banknote, Smartphone } from 'lucide-react';
import { useTipJobMutation } from '@shared/services/api';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

/**
 * A thank-you that goes entirely to the provider. Two moments:
 *
 *   the bill is due   "Your bill ₹410 · add a tip?" — the tip rides on the
 *                     amount to pay (cash to the provider, or online), and the
 *                     total shows it: ₹410 + ₹50 = ₹460. Optional, changeable
 *                     until paid. The provider's screen updates at once.
 *   after the job     from the wallet (reaches them now) or "I gave it in cash".
 *
 * Once per job. Amounts are set in Admin → Economics → Boost & tips.
 */
export default function JobTipCard({ jobId, tip, name, onTipped }) {
  const [tipJob, { isLoading }] = useTipJobMutation();
  const [amount, setAmount] = useState(null);
  const [message, setMessage] = useState('');

  if (tip?.beforePayment) return <TipOnBill jobId={jobId} tip={tip} name={name} onTipped={onTipped} />;

  if (tip?.given) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-100">
        <Heart size={18} className="fill-rose-500 text-rose-500" />
        <p className="text-[13px] text-slate-600">
          You tipped {rupees(tip.given.paise)}{tip.given.method === 'cash' ? ' in cash' : tip.given.method === 'with_payment' ? ' with your bill' : ''}. Thank you.
        </p>
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

/** The bill is ready: the amount, an optional tip, and the total with it in. */
function TipOnBill({ jobId, tip, name, onTipped }) {
  const [tipJob, { isLoading }] = useTipJobMutation();
  const onBill = tip.given?.method === 'with_payment' ? tip.given.paise : 0;
  const [picked, setPicked] = useState(null); // rupees, shown until the saved tip comes back
  useEffect(() => { setPicked(null); }, [onBill]);
  const current = picked ?? Math.round(onBill / 100);
  const bill = tip.billPaise || 0;
  const total = bill + current * 100;
  const cash = tip.paymentMethod === 'cash';
  const who = name || 'your provider';

  async function choose(r) {
    if (isLoading || r === current) return;
    setPicked(r);
    try {
      const res = await tipJob({ id: jobId, amountPaise: r * 100, method: 'with_payment' }).unwrap();
      toast.success(res.message, r ? { icon: '💛' } : undefined);
      onTipped?.();
    } catch (err) {
      setPicked(null);
      toast.error(err?.data?.error || 'Could not update the tip');
    }
  }

  return (
    <motion.div
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100 lg:[column-span:all]"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-navy"><Receipt size={16} className="text-zappy-600" /> Your bill</p>
        <p className="text-[15px] font-bold tabular-nums text-navy">{rupees(bill)}</p>
      </div>

      <div className="px-4 pb-4 pt-3.5">
        <p className="flex items-center gap-2 text-[14px] font-bold text-navy">
          <Heart size={16} className={current ? 'fill-rose-500 text-rose-500' : 'text-rose-500'} />
          Add a tip for {who}?
        </p>
        <p className="mt-0.5 text-[12.5px] text-slate-500">Optional. Every rupee goes to {name || 'them'}.</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {tip.options.map((r) => (
            <motion.button key={r} type="button" onClick={() => choose(r)} disabled={isLoading}
              whileTap={{ scale: 0.94 }}
              className={`rounded-full border px-4 py-2 text-[13.5px] font-bold tabular-nums transition ${current === r
                ? 'border-rose-500 bg-rose-500 text-white shadow-[0_4px_14px_-4px_rgba(244,63,94,0.6)]'
                : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300'}`}>
              ₹{r}
            </motion.button>
          ))}
          <button type="button" onClick={() => choose(0)} disabled={isLoading}
            className={`rounded-full border px-4 py-2 text-[13px] font-semibold ${current === 0 ? 'border-slate-400 bg-slate-100 text-slate-700' : 'border-slate-200 text-slate-500'}`}>
            No tip
          </button>
        </div>

        <div className="mt-4 space-y-1 border-t border-dashed border-slate-200 pt-3 text-[13px] tabular-nums">
          <p className="flex justify-between text-slate-500"><span>Bill</span><span>{rupees(bill)}</span></p>
          {current > 0 && <p className="flex justify-between font-semibold text-rose-600"><span>Tip for {name || 'them'}</span><span>+ ₹{current}</span></p>}
          <p className="flex items-center justify-between pt-1 text-[16px] font-extrabold text-navy">
            <span>To pay</span>
            <span className="flex items-center gap-1.5">{isLoading && <Loader2 size={14} className="animate-spin text-slate-400" />}{rupees(total)}</span>
          </p>
        </div>

        <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-zappy-50 px-3 py-2 text-[12px] leading-relaxed text-zappy-800">
          {cash ? <Banknote size={14} className="mt-0.5 shrink-0" /> : <Smartphone size={14} className="mt-0.5 shrink-0" />}
          {cash
            ? `Hand ${rupees(total)} in cash to ${who}. They record it before closing the job.`
            : `Pay ${rupees(total)} online below${current ? ', tip included' : ''}. You can change the tip until you pay.`}
        </p>
      </div>
    </motion.div>
  );
}
