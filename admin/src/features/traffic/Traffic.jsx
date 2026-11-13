import { useMemo, useState } from 'react';
import { useAdminTrafficLiveQuery, useAdminTrafficSummaryQuery, useAdminTrafficVersionsQuery } from '@shared/services/api';
import { Kpi, RankBars, TrendChart, count } from '../insights/charts';
import { Card, ErrorState, PageSkeleton } from '../../ui/kit';

const SURFACES = {
  'android:customer': 'Customer app',
  'android:servicepro': 'ServicePro app',
  'ios:customer': 'Customer app (iPhone)',
  'ios:servicepro': 'ServicePro app (iPhone)',
  'web:customer': 'Customer website',
  'web:servicepro': 'ServicePro website',
};
export const surfaceName = (k) => SURFACES[k] || k;
export const USER_TYPES = { guest: 'Not signed in', user: 'Customers', shop: 'Shop owners', worker: 'Pros and staff', event_partner: 'Event partners' };
const RANGES = [7, 14, 30, 90];

export function Range({ value, onChange }) {
  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Period">
      {RANGES.map((d) => (
        <button key={d} type="button" role="radio" aria-checked={value === d} onClick={() => onChange(d)}
          className={`rounded-md px-3 py-1 text-[12.5px] font-bold ${value === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{d} days</button>
      ))}
    </div>
  );
}

const toRows = (obj, names = {}) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: names[k] || k, value: v }));

// Who is on the website and the apps this minute; refreshed every 15 s.
export function LiveNowView() {
  const { data, isLoading, isError, refetch } = useAdminTrafficLiveQuery(undefined, { pollingInterval: 15000 });
  if (isLoading) return <PageSkeleton rows={4} />;
  if (isError && !data) return <ErrorState onRetry={refetch} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active right now" value={count(data.total)} hint="Seen in the last 3 minutes" />
        {toRows(data.bySurface, SURFACES).slice(0, 3).map((r) => <Kpi key={r.key} label={surfaceName(r.key)} value={count(r.value)} />)}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Where they are</h3><RankBars rows={data.byCity.map((c) => ({ key: c.name, label: c.name === 'unknown' ? 'Location not shared' : c.name, value: c.count }))} value="value" empty="Nobody right now" /></Card>
        <Card className="p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Who they are</h3><RankBars rows={toRows(data.byUserType, USER_TYPES)} value="value" empty="Nobody right now" /></Card>
        <Card className="p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">What they are looking at</h3><RankBars rows={data.byScreen.map((c) => ({ key: c.name, label: c.name, value: c.count }))} value="value" empty="Nobody right now" /></Card>
      </div>
    </div>
  );
}

// Visits and people per day, for every website and app, with how long a visit lasts.
export function TrafficView() {
  const [days, setDays] = useState(14);
  const [surface, setSurface] = useState('all');
  const { data, isLoading, isError, refetch } = useAdminTrafficSummaryQuery(days);
  const series = useMemo(() => {
    const byDay = new Map();
    for (const r of data?.rows || []) {
      if (surface !== 'all' && r.surface !== surface) continue;
      const d = byDay.get(r.day) || { date: r.day, sessions: 0, people: 0, signedIn: 0 };
      d.sessions += r.sessions; d.people += r.people; d.signedIn += r.signedIn;
      byDay.set(r.day, d);
    }
    return [...byDay.values()];
  }, [data, surface]);
  const bySurface = useMemo(() => {
    const m = {};
    for (const r of data?.rows || []) m[r.surface] = (m[r.surface] || 0) + r.people;
    return toRows(m, SURFACES);
  }, [data]);

  if (isLoading) return <PageSkeleton rows={4} />;
  if (isError && !data) return <ErrorState onRetry={refetch} />;
  const t = series.reduce((a, d) => ({ sessions: a.sessions + d.sessions, people: a.people + d.people, signedIn: a.signedIn + d.signedIn }), { sessions: 0, people: 0, signedIn: 0 });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={surface} onChange={(e) => setSurface(e.target.value)} aria-label="Website or app"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
          <option value="all">All websites and apps</option>
          {(data?.surfaces || []).map((s) => <option key={s} value={s}>{surfaceName(s)}</option>)}
        </select>
        <Range value={days} onChange={setDays} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Visits" value={count(t.sessions)} />
        <Kpi label="People" value={count(t.people)} hint="Each person once a day" />
        <Kpi label="Signed in" value={t.sessions ? `${Math.round((t.signedIn / t.sessions) * 100)}%` : '-'} hint="Of visits" />
        <Kpi label="Per day" value={count(Math.round(t.people / Math.max(1, series.length)))} hint="People, average" />
      </div>
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-800">People and visits each day</h3>
        {series.length ? <TrendChart days={series} bar="people" barLabel="People" line="sessions" lineLabel="Visits" sameScale /> : <p className="py-10 text-center text-sm text-slate-400">No visits in this period yet</p>}
      </Card>
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-800">By website and app</h3>
        <RankBars rows={bySurface} value="value" empty="No visits yet" />
      </Card>
    </div>
  );
}

// Which app versions, Android versions and phones are in use, per app; old versions are the ones to push an update to (System > App versions).
export function VersionsView() {
  const [days, setDays] = useState(7);
  const { data, isLoading, isError, refetch } = useAdminTrafficVersionsQuery(days);
  if (isLoading) return <PageSkeleton rows={4} />;
  if (isError && !data) return <ErrorState onRetry={refetch} />;
  const rows = (list, prefix = '') => (list || []).map((r) => ({ key: `${r.app}:${r.value}`, label: `${r.app === 'servicepro' ? 'ServicePro' : 'Customer'} · ${prefix}${r.value}`, value: r.sessions }));
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Range value={days} onChange={setDays} /></div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">App versions</h3><RankBars rows={rows(data.appVersions, 'v')} value="value" empty="No app visits yet" /></Card>
        <Card className="p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Android versions</h3><RankBars rows={rows(data.osVersions, 'API ')} value="value" empty="No app visits yet" /></Card>
        <Card className="p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Phones</h3><RankBars rows={rows(data.models)} value="value" empty="No app visits yet" /></Card>
      </div>
    </div>
  );
}
