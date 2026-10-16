import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Crown, Loader2 } from 'lucide-react';
import { usePartnerInsightsQuery } from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';

const RANGES = [7, 30, 90];

/** How the team did: jobs and value per day, and per member (server shop/partner.service insights). */
export default function ShopInsightsPage() {
  const nav = useNavigate();
  const [days, setDays] = useState(30);
  const { data, isLoading } = usePartnerInsightsQuery(days);
  const peak = Math.max(1, ...(data?.days || []).map((d) => d.jobs));

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <button onClick={() => nav('/shop')} aria-label="Back" className="text-slate-500"><ArrowLeft size={20} /></button>
        <h1 className="h-card">Insights</h1>
        <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5">
          {RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setDays(r)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${days === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{r} days</button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : (
        <div className="mx-auto max-w-lg space-y-3 px-4 pt-4 lg:max-w-3xl">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Jobs done', data.totals.jobs],
              ['Value of jobs', formatPaise(data.totals.valuePaise)],
              ['Open now', data.open],
              ['Team', `${data.totals.team}${data.totals.leads ? `, ${data.totals.leads} lead${data.totals.leads === 1 ? '' : 's'}` : ''}`],
            ].map(([label, value]) => (
              <div key={label} className="card !p-3">
                <p className="text-[11px] font-semibold text-slate-500">{label}</p>
                <p className="mt-0.5 text-[17px] font-bold tabular-nums text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <section className="card">
            <p className="mb-3 text-[13px] font-bold text-slate-900">Jobs done each day</p>
            <div className="flex h-32 items-end gap-[2px]">
              {data.days.map((d) => (
                <div key={d.date} title={`${d.date}: ${d.jobs} job${d.jobs === 1 ? '' : 's'}, ${formatPaise(d.valuePaise)}`}
                  className="flex-1 rounded-t bg-zappy-500/80" style={{ height: `${(d.jobs / peak) * 100}%`, minHeight: d.jobs ? 3 : 1 }} />
              ))}
            </div>
            <p className="mt-1 flex justify-between text-[10.5px] text-slate-400"><span>{data.days[0]?.date}</span><span>Most in a day: {peak}</span><span>{data.days.at(-1)?.date}</span></p>
          </section>

          <section className="card !p-0">
            <p className="px-4 pt-4 text-[13px] font-bold text-slate-900">By member</p>
            {data.members.length === 0 ? (
              <p className="p-4 text-[12px] text-slate-400">Add people to your team to see how each is doing.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                      {m.name}{m.role === 'lead' && <Crown size={11} className="ml-1 inline text-amber-600" />}
                    </span>
                    <span className="w-14 text-right tabular-nums text-slate-600">{m.jobs} job{m.jobs === 1 ? '' : 's'}</span>
                    <span className="w-20 text-right tabular-nums text-slate-600">{formatPaise(m.valuePaise)}</span>
                    <span className="w-10 text-right tabular-nums text-slate-500">{m.rating ? `${Number(m.rating).toFixed(1)}★` : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
