import { useState } from 'react';
import toast from 'react-hot-toast';
import { Star, Loader2, ShieldAlert } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useRateCustomerMutation, useBlockJobCustomerMutation } from '../../services/api';
import { selectRole } from '../../modules/auth/authSlice';
import { rateOptions } from '../../provider/jobFlows';

/**
 * After the job, the provider rates the customer (server jobs/customer-rating).
 * The customer never sees who rated them; other providers see the average on
 * offers, and ZappyOne looks at anyone rated low or marked unsafe.
 * Shows once per job; nothing after it is sent.
 */
export default function RateCustomerCard({ jobId, rated }) {
  const [rate, { isLoading }] = useRateCustomerMutation();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState([]);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [block, setBlock] = useState(false);
  const [blockCustomer] = useBlockJobCustomerMutation();
  const isWorker = useSelector(selectRole) === 'worker';
  if (rated || done) {
    return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-[12.5px] text-slate-500">You rated this customer. Thank you.</p>;
  }
  const options = rateOptions(stars);
  const toggle = (t) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));

  async function send() {
    try {
      const r = await rate({ id: jobId, stars, tags, note: note.trim() }).unwrap();
      if (block) await blockCustomer({ id: jobId, reason: note.trim() }).unwrap().catch(() => toast.error('Rating saved, but the block did not go through'));
      toast.success(r.message);
      setDone(true);
    } catch (err) {
      if (err?.data?.code === 'ALREADY_RATED') setDone(true);
      toast.error(err?.data?.error || 'Could not save the rating');
    }
  }

  return (
    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
      <p className="text-sm font-bold text-[#0F172A]">How was the customer?</p>
      <p className="mt-0.5 text-[11.5px] text-slate-500">Private: they never see who rated them. It helps other pros, and ZappyOne steps in when someone is unsafe.</p>
      <div className="mt-3 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => { setStars(n); setTags([]); }} aria-label={`${n} star${n > 1 ? 's' : ''}`}>
            <Star size={30} className={n <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
          </button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {options.map(([t, label]) => (
              <button key={t} type="button" onClick={() => toggle(t)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${tags.includes(t)
                  ? (t === 'unsafe' ? 'border-red-600 bg-red-600 text-white' : 'border-slate-900 bg-slate-900 text-white')
                  : (t === 'unsafe' ? 'border-red-200 text-red-700' : 'border-slate-200 text-slate-600')}`}>
                {t === 'unsafe' && <ShieldAlert size={12} />}{label}
              </button>
            ))}
          </div>
          {stars <= 3 && (
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="What happened? (optional, only ZappyOne reads this)"
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zappy-100" />
          )}
          {isWorker && stars <= 2 && (
            <label className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold text-slate-700">
              <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="h-4 w-4 accent-zappy-600" />
              Do not send me jobs from this customer again
            </label>
          )}
          <button type="button" onClick={send} disabled={isLoading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0F172A] py-3 text-sm font-bold text-white disabled:opacity-50">
            {isLoading && <Loader2 size={15} className="animate-spin" />} Send rating
          </button>
        </>
      )}
    </div>
  );
}
