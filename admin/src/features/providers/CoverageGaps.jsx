import { useState } from 'react';
import { Loader2, AlertTriangle, Clock } from 'lucide-react';
import { useAdminCoverageGapsQuery } from '@shared/services/api';

/**
 * What customers can see but nobody can do yet, per service, and the price
 * requests no shop has answered for half an hour (customers waiting now).
 */
const WHY = { nobody_does: 'Nobody does it', no_price: 'No price yet' };

export default function CoverageGaps() {
  const { data, isLoading } = useAdminCoverageGapsQuery(undefined, { pollingInterval: 120000 });
  const [open, setOpen] = useState(null);
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>;
  const lines = data?.lines || [];
  const waiting = data?.unansweredRequests || [];

  return (
    <div className="space-y-4">
      {waiting.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900"><Clock size={14} /> {waiting.length} price {waiting.length === 1 ? 'request' : 'requests'} unanswered for 30+ minutes</p>
          <div className="mt-2 space-y-1">
            {waiting.map((r) => (
              <p key={r._id} className="text-xs text-amber-800">
                {r.reference}, {r.repairCode}, {r.brandCode} {r.modelCode}, {r.location?.address || 'no address'}, {r.shopsAsked} shops asked
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {lines.map((l) => (
          <div key={l.line} className="border-b border-slate-100 last:border-0">
            <button type="button" onClick={() => setOpen(open === l.line ? null : l.line)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900">{l.name}</span>
                <span className="block text-xs text-slate-500">{l.providers.shops} approved shops, {l.providers.individuals} individuals</span>
              </span>
              <span className="text-xs font-bold tabular-nums text-slate-700">{l.bookable}/{l.total} bookable</span>
              {l.gaps.length > 0 && <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700"><AlertTriangle size={11} /> {l.gaps.length} gaps</span>}
            </button>
            {open === l.line && l.gaps.length > 0 && (
              <div className="grid gap-1 px-4 pb-3 sm:grid-cols-2">
                {l.gaps.map((g) => (
                  <p key={g.code} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                    <span className="truncate text-slate-700">{g.name}</span>
                    <span className="shrink-0 font-semibold text-slate-500">{WHY[g.gap]}{g.gap === 'no_price' && !g.standardPrice ? ', set a standard' : ''}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
