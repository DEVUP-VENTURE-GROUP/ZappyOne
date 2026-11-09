import { useState } from 'react';
import {
  useAdminTrafficFunnelQuery, useAdminTrafficNotificationsQuery, useAdminTrafficPartnersQuery, useAdminTrafficRetentionQuery,
  useAdminTrafficSearchesQuery, useAdminTrafficSourcesQuery, useAdminTrafficSpeedQuery,
} from '@shared/services/api';
import { Kpi, RankBars, count } from '../insights/charts';
import { Card, ErrorState, PageSkeleton } from '../../ui/kit';
import { Range, USER_TYPES, surfaceName } from './Traffic';

const pctOf = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
const TYPE_NAMES = { repair: 'Repairs and services', pet: 'Pet care', helping: 'Helping' };
const TH = 'text-left text-[11px] font-bold uppercase tracking-wider text-slate-400';

function Loaded({ q, children }) {
  if (q.isLoading) return <PageSkeleton rows={4} />;
  if (q.isError && !q.data) return <ErrorState onRetry={q.refetch} />;
  return children(q.data);
}

function Table({ head, rows, empty, cols }) {
  return (
    <Card className="overflow-x-auto p-4">
      <table className="w-full text-sm">
        <thead><tr className={TH}>{head}</tr></thead>
        <tbody className="divide-y divide-slate-50">
          {rows}
          {!rows.length && <tr><td colSpan={cols} className="py-8 text-center text-slate-400">{empty}</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

// From a visit to a booking: per website and app, how many visits opened a booking flow, and how many bookings were made, done and lost.
export function FunnelTrafficView() {
  const [days, setDays] = useState(14);
  const q = useAdminTrafficFunnelQuery(days);
  return (
    <Loaded q={q}>{(d) => (
      <div className="space-y-4">
        <div className="flex justify-end"><Range value={days} onChange={setDays} /></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Visits" value={count(d.bySurface.reduce((a, r) => a + r.visits, 0))} />
          <Kpi label="Opened a booking" value={count(d.bySurface.reduce((a, r) => a + r.startedBooking, 0))} />
          <Kpi label="Bookings made" value={count(d.bookings.made)} />
          <Kpi label="Lost" value={count(d.bookings.lost)} hint="No pro took it, or cancelled by a pro or the system" />
        </div>
        <Table cols={5} empty="No visits in this period yet"
          head={<><th className="py-2">Website or app</th><th className="text-right">Visits</th><th className="text-right">Signed in</th><th className="text-right">Opened a booking</th><th className="text-right">Of visits</th></>}
          rows={d.bySurface.map((r) => (
            <tr key={r.surface}><td className="py-2.5 font-semibold text-slate-800">{surfaceName(r.surface)}</td><td className="text-right tabular-nums">{count(r.visits)}</td><td className="text-right tabular-nums">{count(r.signedIn)}</td><td className="text-right tabular-nums">{count(r.startedBooking)}</td><td className="text-right font-bold tabular-nums">{pctOf(r.startedBooking, r.visits)}</td></tr>
          ))} />
      </div>
    )}</Loaded>
  );
}

// Every notification type: how many were sent, how many went as a push, and how many were opened.
export function NotificationsTrafficView() {
  const [days, setDays] = useState(14);
  const q = useAdminTrafficNotificationsQuery(days);
  return (
    <Loaded q={q}>{(d) => (
      <div className="space-y-4">
        <div className="flex justify-end"><Range value={days} onChange={setDays} /></div>
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Sent" value={count(d.totals.sent)} />
          <Kpi label="As a push" value={pctOf(d.totals.pushed, d.totals.sent)} hint={`${count(d.totals.pushed)} pushes`} />
          <Kpi label="Opened" value={pctOf(d.totals.read, d.totals.sent)} hint="Read in the app" />
        </div>
        <Table cols={5} empty="Nothing sent in this period"
          head={<><th className="py-2">Type</th><th>To</th><th className="text-right">Sent</th><th className="text-right">Push</th><th className="text-right">Opened</th></>}
          rows={d.rows.map((r) => (
            <tr key={`${r.type}:${r.to}`}><td className="py-2.5 font-semibold text-slate-800">{String(r.type).replace(/_/g, ' ')}</td><td className="text-slate-500">{USER_TYPES[r.to] || r.to}</td><td className="text-right tabular-nums">{count(r.sent)}</td><td className="text-right tabular-nums">{pctOf(r.pushed, r.sent)}</td><td className="text-right font-bold tabular-nums">{pctOf(r.read, r.sent)}</td></tr>
          ))} />
      </div>
    )}</Loaded>
  );
}

// The supply side: pros online and shops live now, how fast jobs are accepted, and the partners doing the most jobs.
export function PartnersTrafficView() {
  const [days, setDays] = useState(7);
  const q = useAdminTrafficPartnersQuery(days, { pollingInterval: 30000 });
  return (
    <Loaded q={q}>{(d) => (
      <div className="space-y-4">
        <div className="flex justify-end"><Range value={days} onChange={setDays} /></div>
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Pros online now" value={count(d.now.prosOnline)} />
          <Kpi label="Shops live" value={count(d.now.shopsLive)} hint="Live switch on" />
          <Kpi label="Shops with the app open" value={count(d.now.shopsWithAppOpen)} hint="Last 15 minutes" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-800">How fast jobs are accepted</h3>
            <ul className="divide-y divide-slate-50 text-sm">
              {d.accept.map((k) => (
                <li key={k.kind} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="font-semibold text-slate-800">{TYPE_NAMES[k.kind] || k.kind}</span>
                  <span className="text-slate-500">{count(k.made)} made · {count(k.noProvider)} not taken · usually {k.acceptMedianMin ?? '-'} min, slowest {k.acceptP90Min ?? '-'} min</span>
                </li>
              ))}
              {!d.accept.length && <li className="py-6 text-center text-slate-400">No bookings in this period</li>}
            </ul>
          </Card>
          <Card className="p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Top partners by jobs done</h3><RankBars rows={d.top.map((p, i) => ({ key: `${p.kind}${i}`, label: `${p.name} (${p.kind === 'shop' ? 'shop' : 'pro'})`, value: p.jobs }))} value="value" empty="No finished jobs yet" /></Card>
        </div>
      </div>
    )}</Loaded>
  );
}

// Do people come back? Of the signed-in people who first came each week, the share back within 1, 7 and 30 days.
export function RetentionTrafficView() {
  const q = useAdminTrafficRetentionQuery(8);
  const cell = (n, of) => {
    const p = of ? Math.round((n / of) * 100) : 0;
    return <td className="text-right font-bold tabular-nums" style={{ background: `rgba(31,79,216,${Math.min(0.85, p / 100)})`, color: p > 45 ? '#fff' : '#0F172A' }}>{of ? `${p}%` : '-'}</td>;
  };
  return (
    <Loaded q={q}>{(d) => (
      <div className="space-y-3">
        <p className="text-[13px] text-slate-500">Signed-in people, by the week they first came: how many came back on a later day.</p>
        <Table cols={5} empty="Not enough signed-in visits yet"
          head={<><th className="py-2">Week of</th><th className="text-right">People</th><th className="text-right">Next day</th><th className="text-right">Within 7 days</th><th className="text-right">Within 30 days</th></>}
          rows={d.cohorts.map((c) => (
            <tr key={c.week}><td className="py-2.5 font-semibold text-slate-800">{new Date(`${c.week}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td><td className="text-right tabular-nums">{count(c.people)}</td>{cell(c.d1, c.people)}{cell(c.d7, c.people)}{cell(c.d30, c.people)}</tr>
          ))} />
      </div>
    )}</Loaded>
  );
}

// What people search for, and what found nobody near them: the next services to launch.
export function SearchTrafficView() {
  const [days, setDays] = useState(30);
  const q = useAdminTrafficSearchesQuery(days);
  const name = (c) => String(c || 'unknown').replace(/_/g, ' ');
  return (
    <Loaded q={q}>{(d) => (
      <div className="space-y-4">
        <div className="flex justify-end"><Range value={days} onChange={setDays} /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Most searched</h3><RankBars rows={d.top.slice(0, 12).map((r) => ({ key: r.category, label: name(r.category), value: r.total }))} value="value" empty="No searches yet" /></Card>
          <Card className="p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Searched, but nobody near them</h3><RankBars rows={d.unmet.map((r) => ({ key: r.category, label: name(r.category), value: r.noService }))} value="value" color="#DC2626" empty="Every search found someone" /></Card>
        </div>
      </div>
    )}</Loaded>
  );
}

// Where website visits come from, and sign-ups through a friend's code.
export function SourcesTrafficView() {
  const [days, setDays] = useState(30);
  const q = useAdminTrafficSourcesQuery(days);
  return (
    <Loaded q={q}>{(d) => (
      <div className="space-y-4">
        <div className="flex justify-end"><Range value={days} onChange={setDays} /></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><Kpi label="Sign-ups with a friend's code" value={count(d.referralSignups)} /></div>
        <Card className="p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Where website visits came from</h3><RankBars rows={d.referrers.map((r) => ({ key: r.source, label: r.source === 'direct' ? 'Typed the address or a saved link' : r.source, value: r.visits }))} value="value" empty="No website visits yet" /></Card>
      </div>
    )}</Loaded>
  );
}

// The slowest server calls since it last started (typical and worst 5%), refreshed every 30 s.
export function SpeedTrafficView() {
  const q = useAdminTrafficSpeedQuery(undefined, { pollingInterval: 30000 });
  const tone = (ms) => (ms >= 2000 ? 'text-rose-700' : ms >= 800 ? 'text-amber-700' : 'text-emerald-700');
  return (
    <Loaded q={q}>{(d) => (
      <div className="space-y-3">
        <p className="text-[13px] text-slate-500">Measured since the server started on {new Date(d.since).toLocaleString('en-IN')}. A restart starts these again. Errors are in System status &gt; Live errors.</p>
        <Table cols={5} empty="No calls measured yet"
          head={<><th className="py-2">Call</th><th className="text-right">Calls</th><th className="text-right">Usually</th><th className="text-right">Slowest 5%</th><th className="text-right">Server errors</th></>}
          rows={d.routes.map((r) => (
            <tr key={r.route}><td className="py-2.5 font-mono text-[12.5px] text-slate-700">{r.route}</td><td className="text-right tabular-nums">{count(r.calls)}</td><td className={`text-right tabular-nums ${tone(r.p50)}`}>{r.p50} ms</td><td className={`text-right font-bold tabular-nums ${tone(r.p95)}`}>{r.p95} ms</td><td className={`text-right tabular-nums ${r.errors ? 'font-bold text-rose-700' : ''}`}>{count(r.errors)}</td></tr>
          ))} />
      </div>
    )}</Loaded>
  );
}
