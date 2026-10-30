import { useState } from 'react';
import { Timer, CheckCircle2, AlarmClock, Navigation, MapPin, Smartphone, Laptop } from 'lucide-react';
import { useAdminArrivalReportQuery, useAdminWorkerLocationsQuery } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';

/**
 * Arrivals — did we get there when we said we would? (server jobs/promise)
 *
 *   headline   on-time share, how late when late, visits, promises live now
 *   by hour    where in the day promises slip (IST)
 *   providers  lowest on-time first: who to coach or rank down
 *   areas      ~1 km squares, lowest first: where supply is thin
 *   locations  everyone online and how sure we are where they are — a laptop
 *              or a weak fix shows red (going online needs within 500 m)
 */
const pctTone = (p) => (p == null ? 'text-slate-400' : p >= 90 ? 'text-emerald-600' : p >= 75 ? 'text-amber-600' : 'text-red-600');

export default function Arrivals() {
  const [days, setDays] = useState(7);
  const { data, isLoading } = useAdminArrivalReportQuery(days, { pollingInterval: 60000 });
  const { data: loc } = useAdminWorkerLocationsQuery(undefined, { pollingInterval: 30000 });

  if (isLoading || !data) return <PageLoader />;
  const o = data.overall;
  const maxHour = Math.max(1, ...data.byHour.map((h) => h.visits));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {[1, 7, 30].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)}
            className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${days === d ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>
            {d === 1 ? 'Today' : `${d} days`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat Icon={CheckCircle2} label="On time" value={o.onTimePct != null ? `${o.onTimePct}%` : '-'} tone={pctTone(o.onTimePct)} sub="arrived by the promise + 5 min" />
        <Stat Icon={AlarmClock} label="Late by, when late" value={o.avgLateMin ? `${o.avgLateMin} min` : '-'} tone="text-slate-900" sub="average" />
        <Stat Icon={Navigation} label="Visits measured" value={o.visits} tone="text-slate-900" sub={`promised ~${o.avgPromisedMin ?? '-'} min on average`} />
        <Stat Icon={Timer} label="On the way now" value={data.onTrackNow} tone="text-blue-600" sub="promises still running" />
      </div>

      <Card className="p-4">
        <p className="mb-3 text-[13px] font-semibold text-slate-700">On time by hour of day (IST)</p>
        {!data.byHour.length ? <p className="text-[12px] text-slate-400">No visits yet.</p> : (
          <div className="flex h-28 items-end gap-1">
            {Array.from({ length: 24 }, (_, h) => data.byHour.find((r) => r.key === h)).map((r, h) => (
              <div key={h} className="flex flex-1 flex-col items-center gap-1" title={r ? `${h}:00, ${r.visits} visits, ${r.onTimePct}% on time` : `${h}:00, none`}>
                <div className={`w-full rounded-sm ${!r ? 'bg-slate-100' : r.onTimePct >= 90 ? 'bg-emerald-400' : r.onTimePct >= 75 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ height: `${r ? Math.max(8, (r.visits / maxHour) * 100) : 4}%` }} />
                <span className="text-[9px] text-slate-400">{h % 3 === 0 ? h : ''}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">Bar height = visits; colour = on time (green 90%+, amber 75%+, red below).</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="Providers, least on time first" empty="No provider has 1 measured visit yet."
          rows={data.byProvider} cols={[['Provider', (r) => <span className="font-semibold">{r.name} <span className="text-[11px] font-normal text-slate-400">{r.kind}</span></span>],
            ['Visits', (r) => r.visits], ['On time', (r) => <span className={`font-bold ${pctTone(r.onTimePct)}`}>{r.onTimePct}%</span>], ['Late by', (r) => (r.avgLateMin ? `${r.avgLateMin} min` : '-')]]} />
        <Table title="Areas (~1 km), least on time first" empty="No area measured yet."
          rows={[...data.byArea].sort((a, b) => (a.onTimePct ?? 101) - (b.onTimePct ?? 101))}
          cols={[['Area', (r) => <a className="font-mono text-blue-600 hover:underline" href={`https://www.google.com/maps?q=${r.key}`} target="_blank" rel="noreferrer">{r.key}</a>],
            ['Visits', (r) => r.visits], ['On time', (r) => <span className={`font-bold ${pctTone(r.onTimePct)}`}>{r.onTimePct}%</span>], ['Promised', (r) => (r.avgPromisedMin ? `~${r.avgPromisedMin} min` : '-')]]} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-[13px] font-semibold text-slate-700">Online now: how sure we are where they are</p>
          <p className="text-[11.5px] text-slate-400">{loc?.workers?.length ?? 0} online</p>
        </div>
        {!loc?.workers?.length ? <EmptyState message="Nobody online right now." icon={MapPin} /> : (
          <ul className="divide-y divide-slate-100">
            {loc.workers.map((w) => {
              const acc = w.accuracyM;
              const bad = acc == null || acc > 500 || !w.live;
              const Icon = acc != null && acc > 500 ? Laptop : Smartphone;
              return (
                <li key={w.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full ${bad ? 'bg-red-50 text-red-600' : acc > 100 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}><Icon size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-800">{w.name || 'Unnamed'}</span>{w.shop && <span className="ml-1 text-[11px] text-slate-400">shop technician</span>}
                    <span className="block text-[11.5px] text-slate-500">{w.phone}{!w.live ? ', no signal lately' : ''}</span>
                  </span>
                  <span className={`text-[12px] font-semibold ${bad ? 'text-red-600' : acc > 100 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {acc == null ? 'accuracy unknown (old app)' : `within ${acc >= 1000 ? `${(acc / 1000).toFixed(1)} km` : `${acc} m`}`}
                  </span>
                  {w.lat != null && <a className="text-[12px] text-blue-600 hover:underline" href={`https://www.google.com/maps?q=${w.lat},${w.lng}`} target="_blank" rel="noreferrer">Map</a>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ Icon, label, value, sub, tone }) {
  return (
    <Card className="p-4">
      <Icon size={17} className="text-slate-400" />
      <p className={`mt-1.5 text-[24px] font-black tabular-nums ${tone}`}>{value}</p>
      <p className="text-[12px] font-semibold text-slate-600">{label}</p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </Card>
  );
}

function Table({ title, rows, cols, empty }) {
  return (
    <Card className="overflow-hidden">
      <p className="border-b border-slate-100 px-4 py-3 text-[13px] font-semibold text-slate-700">{title}</p>
      {!rows.length ? <p className="px-4 py-6 text-center text-[12px] text-slate-400">{empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>{cols.map(([h]) => <th key={h} className="px-4 py-2">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 20).map((r, i) => <tr key={i}>{cols.map(([h, f]) => <td key={h} className="px-4 py-2">{f(r)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
