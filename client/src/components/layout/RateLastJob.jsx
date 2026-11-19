import { useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Star, Loader2 } from 'lucide-react';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useRateLastJob } from '@shared/customer/useRateLastJob';

// After a job is done the customer rates it before going on: one card that stays until a star is given (rated once, last 7 days).
export default function RateLastJob() {
  const { accessToken, role } = useSelector(selectAuth);
  const signedIn = Boolean(accessToken) && role === 'user';
  const { job, rate, saving } = useRateLastJob({ skip: !signedIn });
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  if (!signedIn || !job) return null;

  async function send() {
    try { await rate(stars, comment.trim()); toast.success('Thanks. Your rating helps the next customer.'); setStars(0); setComment(''); }
    catch (err) { toast.error(err?.data?.error || 'Could not save your rating. Try again.'); }
  }
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink-900/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="rate-title">
      <div className="w-full max-w-sm rounded-card bg-white p-5 shadow-xl">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-400">Job done</p>
        <h2 id="rate-title" className="mt-1 text-[20px] font-extrabold text-ink-900">How was your {job.title}?</h2>
        <p className="mt-0.5 text-[13px] text-ink-500">Rate it to continue. Booking {job.reference}.</p>
        <div className="mt-4 flex justify-center gap-2" role="radiogroup" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setStars(n)}
              className="rounded-full p-1 transition-transform active:scale-90">
              <Star size={34} className={n <= stars ? 'fill-amber-400 text-amber-400' : 'text-ink-200'} />
            </button>
          ))}
        </div>
        {stars > 0 && stars < 4 && (
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="What went wrong? (optional)"
            className="mt-3 w-full resize-none rounded-btn border border-line px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-zappy-400" />
        )}
        <button type="button" onClick={send} disabled={!stars || saving} className="btn-primary mt-4 h-12 w-full disabled:opacity-50">
          {saving ? <><Loader2 size={15} className="animate-spin" /> Saving</> : 'Submit rating'}
        </button>
      </div>
    </div>
  );
}
