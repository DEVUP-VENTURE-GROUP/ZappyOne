import { useState } from 'react';
import { Loader2, Search, TrendingUp, AlertTriangle, MapPin, BarChart2 } from 'lucide-react';
import { useAdminSearchAnalyticsQuery } from '@client/services/api';

function Stat({ icon: Icon, label, value, tone = 'slate', suffix = '' }) {
  const tones = { slate: 'text-slate-900', rose: 'text-rose-600', amber: 'text-amber-600', indigo: 'text-indigo-600' };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Icon size={13} /> {label}</div>
      <p className={`text-2xl font-black mt-1 ${tones[tone]}`}>{Number(value ?? 0).toLocaleString('en-IN')}{suffix}</p>
    </div>
  );
}

export default function SearchIntel() {
  const [days, setDays] = useState(7);
  const { data, isLoading } = useAdminSearchAnalyticsQuery(days, { pollingInterval: 60000 });

  if (isLoading || !data) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-500" /></div>;

  const maxDaily = Math.max(1, ...(data.daily || []).map((d) => d.count));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Search Intelligence</h2>
          <p className="text-sm text-slate-500 mt-1">What users search, what they can’t find, and where demand is moving.</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none">
          <option value={1}>24h</option><option value={7}>7 days</option><option value={30}>30 days</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Search} label="Total searches" value={data.totals.searches} />
        <Stat icon={AlertTriangle} label="No-result" value={data.totals.noResult} tone="rose" />
        <Stat icon={BarChart2} label="No-result rate" value={data.totals.noResultRate} tone="amber" suffix="%" />
      </div>

      {/* Daily volume sparkline */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-bold text-slate-700 mb-3">Search volume</p>
        <div className="flex items-end gap-1 h-24">
          {(data.daily || []).map((d) => (
            <div key={d.date} className="flex-1 bg-indigo-500/80 rounded-t hover:bg-indigo-600 transition-colors" style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%` }} title={`${d.date}: ${d.count}`} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top searches */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5"><Search size={14} /> Top searches</p>
          <div className="space-y-2">
            {data.topSearches.slice(0, 10).map((s) => (
              <div key={s.category} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-slate-700 truncate">{s.category}</span>
                {s.missRate > 30 && <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-full">{s.missRate}% miss</span>}
                <span className="font-black tabular-nums text-slate-900">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trending */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5"><TrendingUp size={14} className="text-emerald-600" /> Trending up</p>
          {data.trending.length === 0 ? <p className="text-sm text-slate-400 py-3">Not enough data yet.</p> : (
            <div className="space-y-2">
              {data.trending.map((t) => (
                <div key={t.category} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-slate-700 truncate">{t.category}</span>
                  <span className="text-[11px] font-black text-emerald-600">▲ {t.pct}%</span>
                  <span className="font-black tabular-nums text-slate-900">{t.now}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Unmet demand — the money list: users searched, we had nothing */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-1.5"><AlertTriangle size={14} className="text-rose-500" /> Unmet demand (no results)</p>
        <p className="text-xs text-slate-400 mb-3">Where users searched but saw nothing — activate a service or add supply here.</p>
        {data.noResultSearches.length === 0 ? <p className="text-sm text-slate-400 py-3">No unmet-demand searches. 🎉</p> : (
          <div className="divide-y divide-slate-100">
            {data.noResultSearches.map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1 text-slate-800 font-medium truncate">{r.category}</span>
                <span className="text-slate-400 flex items-center gap-1"><MapPin size={12} /> {r.city}</span>
                <span className="font-black text-rose-600 tabular-nums">{r.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* By city */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5"><MapPin size={14} /> Demand by city</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {data.byCity.map((c) => (
            <div key={c.city} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-slate-700 truncate">{c.city}</span>
              {c.missRate > 30 && <span className="text-[10px] font-bold text-amber-600">{c.missRate}% miss</span>}
              <span className="font-black tabular-nums text-slate-900">{c.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
