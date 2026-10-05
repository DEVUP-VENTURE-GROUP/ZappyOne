import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Flag, Loader2, EyeOff, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMyReviewsQuery, useReportReviewMutation } from '../../services/api';

/**
 * A provider's own reviews: the rating customers see, the star spread and
 * every review, newest first. A review that looks wrong (not their job,
 * abusive, fake) can be reported; an admin decides. Used by Rakshak workers,
 * ServicePro shops and their technicians.
 *
 *   back      where the back arrow goes ('/worker', '/shop')
 *   embedded  inside a portal shell that already has its own header (events)
 */
function Stars({ value, size = 14 }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-line-strong'} />
      ))}
    </span>
  );
}

function ReportBox({ review, onDone }) {
  const [reason, setReason] = useState('');
  const [report, { isLoading }] = useReportReviewMutation();
  async function send(e) {
    e.preventDefault();
    try {
      await report({ id: review.id, reason: reason.trim() }).unwrap();
      toast.success('Sent for review. We will look at it and let you know.');
      onDone();
    } catch (err) { toast.error(err?.data?.error || 'That did not go through. Please try again.'); }
  }
  return (
    <form onSubmit={send} className="mt-3 space-y-2">
      <textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className="input w-full resize-none py-2"
        placeholder="What is wrong with this review? For example: I did not do this job." aria-label="Why you are reporting this review" />
      <div className="flex gap-2">
        <button type="submit" disabled={isLoading || reason.trim().length < 5} className="btn-primary min-h-[38px] px-4 text-[13px]">
          {isLoading && <Loader2 size={14} className="animate-spin" />} Send
        </button>
        <button type="button" onClick={onDone} className="btn-outline min-h-[38px] px-4 text-[13px]">Cancel</button>
      </div>
    </form>
  );
}

export default function ProviderReviewsPage({ back = '/worker', embedded = false }) {
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const [reporting, setReporting] = useState(null);
  const { data, isLoading, isError, refetch } = useMyReviewsQuery(page);
  const total = data?.reviewCount || 0;

  return (
    <div className={embedded ? '' : 'min-h-screen bg-canvas'}>
      {embedded ? <h1 className="mx-auto max-w-2xl px-4 pt-5 text-[20px] font-bold text-ink-900">My reviews</h1> : <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => nav(back)} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-btn bg-sunken text-ink-700 hover:bg-line">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-[17px] font-bold text-ink-900">My reviews</h1>
        </div>
      </header>}

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-zappy-600" /></div>
        ) : isError ? (
          <div className="rounded-card border border-line bg-white p-6 text-center">
            <p className="text-[14px] text-ink-500">Your reviews did not load.</p>
            <button type="button" onClick={refetch} className="btn-outline mt-3 min-h-[38px] px-4 text-[13px]">Try again</button>
          </div>
        ) : (
          <>
            <section className="flex gap-5 rounded-card border border-line bg-white p-5">
              <div className="flex shrink-0 flex-col items-center justify-center">
                <p className="text-[36px] font-extrabold leading-none text-ink-900 tabular-nums">{total ? data.rating.toFixed(1) : '—'}</p>
                <div className="mt-2"><Stars value={Math.round(data.rating)} /></div>
                <p className="mt-1.5 text-[12px] text-ink-500">{total ? `${total} review${total === 1 ? '' : 's'}` : 'No reviews yet'}</p>
              </div>
              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = data.breakdown?.[n] || 0;
                  return (
                    <div key={n} className="flex items-center gap-2 text-[12px] text-ink-500">
                      <span className="w-3 tabular-nums">{n}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                        <span className="block h-full rounded-full bg-amber-400" style={{ width: `${total ? (c / total) * 100 : 0}%` }} />
                      </span>
                      <span className="w-6 text-right tabular-nums">{c}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {!data.reviews.length ? (
              <div className="rounded-card border border-line bg-white p-8 text-center">
                <MessageSquare className="mx-auto text-ink-400" size={24} />
                <p className="mt-2 text-[15px] font-semibold text-ink-900">No reviews yet</p>
                <p className="mt-1 text-[13px] text-ink-500">Customers can rate you after each finished job. Their reviews show here.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.reviews.map((r) => (
                  <li key={r.id} className="rounded-card border border-line bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Stars value={r.rating} />
                        <p className="mt-1 text-[13px] text-ink-500">
                          {r.by}{r.service ? ` · ${r.service}` : ''} · {new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      {!r.reported && reporting !== r.id && (
                        <button type="button" onClick={() => setReporting(r.id)} className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ink-500 hover:text-ink-900">
                          <Flag size={13} /> Report
                        </button>
                      )}
                    </div>
                    {r.text && <p className="mt-2 text-[14px] leading-relaxed text-ink-900">{r.text}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.reported && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Reported · being looked at</span>}
                      {r.hidden && <span className="flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-500"><EyeOff size={11} /> Not shown to customers</span>}
                      {r.excluded && <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-500">Not counted in your rating</span>}
                    </div>
                    {reporting === r.id && <ReportBox review={r} onDone={() => setReporting(null)} />}
                  </li>
                ))}
              </ul>
            )}

            {data.pages > 1 && (
              <div className="flex items-center justify-between">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-outline min-h-[38px] px-4 text-[13px]">Newer</button>
                <span className="text-[12px] text-ink-500 tabular-nums">Page {page} of {data.pages}</span>
                <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="btn-outline min-h-[38px] px-4 text-[13px]">Older</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
