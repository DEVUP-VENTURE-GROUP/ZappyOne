import { useState } from 'react';
import { Star, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAdminReviewsQuery, useAdminModerateReviewMutation } from '@shared/services/api';
import { SectionHeader, Card, PageLoader, EmptyState, Pagination, fmtDate } from '../../ui/kit';

/**
 * Review moderation. Reported (by the provider) and auto-flagged reviews come
 * first. Nothing is deleted: hiding takes the words off public pages, excluding
 * takes the stars out of the provider's rating, dismissing keeps it as it is.
 */
function Row({ r }) {
  const [moderate, { isLoading }] = useAdminModerateReviewMutation();
  const [reason, setReason] = useState('');

  async function act(action) {
    try {
      await moderate({ id: r.id, action, reason: reason.trim() }).unwrap();
      toast.success('Saved');
    } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  const actions = [
    ...(r.status === 'hidden' ? [['show', 'Show words']] : [['hide', 'Hide words']]),
    ...(r.excluded ? [['include', 'Count again']] : [['exclude', "Don't count"]]),
    ...(r.flagged ? [['dismiss', 'Keep as is']] : []),
  ];

  return (
    <li className="border-t border-slate-100 px-4 py-4 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} className={n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />)}
            </span>
            <span className="text-[12px] text-slate-400">{fmtDate(r.at)} · {r.kind}{r.service ? ` · ${r.service}` : ''}</span>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            <b className="text-slate-700">{r.customer?.name || 'Customer'}</b> about <b className="text-slate-700">{r.provider || 'provider'}</b>
          </p>
          {r.text ? <p className="mt-2 text-sm text-slate-800">{r.text}</p> : <p className="mt-2 text-sm italic text-slate-400">Stars only, no words</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.flagged && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{r.flagReason || 'Flagged'}</span>}
            {r.status === 'hidden' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Words hidden</span>}
            {r.excluded && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Not counted</span>}
            {r.moderation?.at && <span className="text-[11px] text-slate-400">Last decision {fmtDate(r.moderation.at)}{r.moderation.reason ? `: ${r.moderation.reason}` : ''}</span>}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-64">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason (kept with the decision)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex flex-wrap gap-1.5">
            {actions.map(([a, label]) => (
              <button key={a} type="button" disabled={isLoading} onClick={() => act(a)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function Reviews() {
  const [flagged, setFlagged] = useState(true);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useAdminReviewsQuery({ ...(flagged && { flagged: 1 }), page });

  return (
    <div className="space-y-4">
      <SectionHeader title="Reviews" subtitle="Reported and flagged reviews first. Nothing is deleted; every decision is kept.">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-[13px] font-semibold">
          {[[true, 'Needs a look'], [false, 'All reviews']].map(([v, l]) => (
            <button key={l} type="button" onClick={() => { setFlagged(v); setPage(1); }}
              className={`rounded-md px-3 py-1.5 ${flagged === v ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>{l}</button>
          ))}
        </div>
      </SectionHeader>
      {isLoading ? <PageLoader /> : isError ? <EmptyState message="Reviews did not load. Refresh to try again." /> : !data.reviews.length ? (
        <EmptyState message={flagged ? 'Nothing waiting. Reported and flagged reviews show here.' : 'No reviews yet.'} />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul>{data.reviews.map((r) => <Row key={r.id} r={r} />)}</ul>
        </Card>
      )}
      {data?.pages > 1 && <Pagination page={page} totalPages={data.pages} onChange={setPage} />}
    </div>
  );
}
