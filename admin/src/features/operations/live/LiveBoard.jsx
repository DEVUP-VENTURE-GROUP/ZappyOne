import { useMemo, useState } from 'react';
import { useAdminLiveOpsQuery } from '@shared/services/api';
import { SectionHeader, Card, PageLoader } from '../../../ui/kit';
import { MapPin, Users, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { BookingDrawer } from '../../bookings/Bookings';

/**
 * Every job happening right now, of every kind, and who is online.
 *
 * Stuck jobs come first, then ones still waiting for a provider, then the
 * rest — the order an ops person works them in. "Stuck" is each kind's own
 * clock (server: jobs/kinds.js), so a repair at the workshop for a day is
 * normal while a helper en route for ninety minutes is not.
 */

const KIND_LABEL = { repair: 'Repair', pet: 'Pet care', helping: 'Helping', event: 'Event' };
const KIND_TONE = {
  repair: 'bg-blue-50 text-blue-700', pet: 'bg-amber-50 text-amber-700',
  helping: 'bg-emerald-50 text-emerald-700', event: 'bg-zappy-50 text-zappy-700',
};
const label = (s = '') => s.replace(/_/g, ' ').toLowerCase();

function minutes(m) {
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} days`;
}

function Stat({ label: text, value, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{text}</p>
    </div>
  );
}

export default function LiveBoard() {
  const [poll, setPoll] = useState(10000);
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState(null);
  const { data, isLoading, isFetching, refetch } = useAdminLiveOpsQuery(undefined, { pollingInterval: poll });

  const jobs = useMemo(() => (data?.jobs || [])
    .filter((j) => !kind || j.kind === kind)
    .sort((a, b) => Number(!!b.stuck) - Number(!!a.stuck) || Number(b.waiting) - Number(a.waiting) || b.minutesInStatus - a.minutesInStatus),
  [data, kind]);

  if (isLoading) return <PageLoader />;
  const counts = data?.jobCounts || { live: 0, waiting: 0, stuck: 0, byKind: {} };
  const workers = data?.workerLocations || [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Live operations"
        subtitle={data?.checkedAt ? `Updated ${new Date(data.checkedAt).toLocaleTimeString('en-IN')}` : undefined}
      >
        <div className="flex items-center gap-2">
          <select
            value={poll}
            onChange={(e) => setPoll(Number(e.target.value))}
            aria-label="Refresh every"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
          >
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
            <option value={0}>Manual</option>
          </select>
          <button type="button" onClick={refetch} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </SectionHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Live jobs" value={counts.live} />
        <Stat label="Waiting for a provider" value={counts.waiting} tone="text-amber-700" />
        <Stat label="Stuck" value={counts.stuck} tone={counts.stuck ? 'text-red-600' : 'text-slate-900'} />
        <Stat label="Workers online" value={data?.counts?.onlineWorkers ?? workers.length} tone="text-emerald-700" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[['', 'All'], ...Object.keys(KIND_LABEL).map((k) => [k, KIND_LABEL[k]])].map(([k, text]) => {
          const n = k ? counts.byKind?.[k]?.live || 0 : counts.live;
          return (
            <button
              key={k || 'all'}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${kind === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              {text} · {n}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          {jobs.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">Nothing live right now.</p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
              {jobs.map((j) => (
                <li key={`${j.kind}-${j.id}`}>
                  <button type="button" onClick={() => setOpen({ source: j.kind, id: j.id })} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-slate-50">
                    <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${KIND_TONE[j.kind] || 'bg-slate-100 text-slate-600'}`}>
                      {KIND_LABEL[j.kind] || j.kind}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold capitalize text-slate-800">{j.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span className="capitalize">{label(j.status)}</span>
                        <span className="flex items-center gap-1"><Clock size={11} /> {minutes(j.minutesInStatus)}</span>
                        {j.address && <span className="flex min-w-0 items-center gap-1 truncate"><MapPin size={11} /> {j.address}</span>}
                      </span>
                      {j.stuck && (
                        <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-600">
                          <AlertTriangle size={12} /> Stuck: {j.stuck}
                        </span>
                      )}
                    </span>
                    {j.waiting && !j.stuck && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Waiting</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <Users size={15} className="text-slate-500" />
            <p className="text-sm font-semibold text-slate-700">Workers online ({workers.length})</p>
          </div>
          {workers.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">No workers online.</p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-slate-50 overflow-y-auto">
              {workers.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${w.lat},${w.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600 hover:text-slate-900"
                  >
                    {String(w.id).slice(-8)} · {w.lat?.toFixed(4)}, {w.lng?.toFixed(4)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {open && <BookingDrawer {...open} onClose={() => { setOpen(null); refetch(); }} />}
    </div>
  );
}
