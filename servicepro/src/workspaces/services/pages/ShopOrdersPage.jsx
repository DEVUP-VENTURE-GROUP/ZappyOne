import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useShopWorkersQuery } from '@shared/services/api';
import { useProviderJobs } from '@shared/provider/useProviderJobs';
import { BOARD_COLUMNS, bucketOf } from '@shared/provider/partnerBoard';
import { formatPaise } from '@shared/utils/money';
import AssignTechnician from '@shared/provider/components/AssignTechnician';
import { useTradeWords } from '../../../shell/useTradeWords';

const SHOP_KINDS = ['repair', 'pet'];

// Every job the partner holds as a board, filterable by member or lead's group.
export default function ShopOrdersPage() {
  const words = useTradeWords();
  const nav = useNavigate();
  const { mine, isLoading } = useProviderJobs({ kinds: SHOP_KINDS });
  const { data } = useShopWorkersQuery();
  const [who, setWho] = useState('');
  const workers = data?.workers || [];
  const nameOf = (id) => workers.find((w) => String(w._id) === String(id))?.name;
  const leads = workers.filter((w) => w.team?.role === 'lead');

  const shown = useMemo(() => {
    if (!who) return mine;
    if (who.startsWith('group:')) {
      const lead = who.slice(6);
      const group = new Set([lead, ...workers.filter((w) => String(w.team?.leadId) === lead).map((w) => String(w._id))]);
      return mine.filter((j) => group.has(String(j.workerId)));
    }
    return mine.filter((j) => String(j.workerId) === who);
  }, [mine, who, workers]);

  const columns = BOARD_COLUMNS.map((c) => ({ ...c, jobs: shown.filter((j) => bucketOf(j.rawStatus, j.workerId) === c.key) }));
  const busy = mine.reduce((m, j) => (j.workerId && bucketOf(j.rawStatus, j.workerId) !== 'done' ? { ...m, [j.workerId]: (m[j.workerId] || 0) + 1 } : m), {});

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <button onClick={() => nav('/shop')} aria-label="Back" className="text-slate-500"><ArrowLeft size={20} /></button>
        <h1 className="h-card">{words('orders', 'Orders')}</h1>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Show jobs of"
          className="ml-auto max-w-[55%] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700">
          <option value="">Whole team</option>
          {leads.map((l) => <option key={`g${l._id}`} value={`group:${l._id}`}>{l.name || l.phone}'s group</option>)}
          {workers.map((w) => <option key={w._id} value={String(w._id)}>{w.name || w.phone}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : (
        <div className="flex gap-3 overflow-x-auto px-4 pt-4 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {columns.map((c) => (
            <section key={c.key} className="w-[78vw] max-w-xs shrink-0 lg:w-auto lg:max-w-none">
              <p className="mb-2 flex items-center justify-between text-[12px] font-bold uppercase tracking-wide text-slate-500">
                {c.label}<span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600">{c.jobs.length}</span>
              </p>
              <div className="space-y-2">
                {c.jobs.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[12px] text-slate-400">Nothing here</p>}
                {c.jobs.map((j) => (
                  <article key={`${j.kind}${j.id}`} className={`rounded-xl border bg-white p-3 ${j.attention ? 'border-amber-300' : 'border-slate-200'}`}>
                    <Link to={j.to} className="block">
                      <p className="truncate text-[13.5px] font-semibold text-slate-900">{j.title}</p>
                      <p className="truncate text-[12px] text-slate-500">{j.subtitle}</p>
                      <p className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px]">
                        <span className={`font-semibold ${j.late ? 'text-red-600' : 'text-slate-600'}`}>{j.status}{j.late ? ', late' : ''}</span>
                        {j.valuePaise > 0 && <span className="tabular-nums text-slate-500">{formatPaise(j.valuePaise)}</span>}
                      </p>
                      {j.workerId && <p className="mt-1 text-[11.5px] text-slate-500">With {nameOf(j.workerId) || 'a member'}</p>}
                    </Link>
                    {c.key !== 'done' && c.key !== 'on_the_way' && c.key !== 'in_progress' && (
                      <AssignTechnician jobId={j.id} workerId={j.workerId} busy={busy} />
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
