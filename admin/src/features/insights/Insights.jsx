import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity, Radio, Search, MapPinOff, Rocket, Crown, Globe, TrendingUp,
  BarChart2, Users, ShoppingBag, IndianRupee, Wifi, ChevronDown, RefreshCw,
  Monitor, Smartphone, ArrowUpRight, ArrowDownRight, Briefcase, Flame,
  Filter, FileText, Download, Star,
} from 'lucide-react';
import {
  useAdminIntelLiveTrafficQuery, useAdminIntelVisitorLocationsQuery,
  useAdminIntelUnmetDemandQuery, useAdminIntelExpansionQuery, useAdminIntelCeoQuery,
  useAdminIntelFunnelQuery, useAdminIntelReportQuery, useAdminIntelPartnersQuery,
} from '@shared/services/api';
import { SectionHeader, Card, PageLoader, EmptyState, StatCard, BarChart, Th, Td } from '../../ui/kit';
import BusinessIntelligence from './BusinessIntelligence';
import Heatmap from './Heatmap';
import Analytics from './Analytics';
import SearchIntel from './SearchIntel';
import Retention from './Retention';

/* helpers */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const num = (n) => (Number(n) || 0).toLocaleString('en-IN');
function dwell(sec) {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}
function Delta({ pct }) {
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(pct)}%
    </span>
  );
}
function MiniBars({ rows, color = '#6366f1', max = 5 }) {
  const top = (rows || []).slice(0, max);
  const hi = Math.max(1, ...top.map((r) => r.n));
  return (
    <div className="space-y-1.5">
      {top.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 w-28 truncate capitalize">{r.label}</span>
          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.n / hi) * 100}%`, background: color }} />
          </div>
          <span className="text-[11px] font-bold text-slate-700 tabular-nums w-8 text-right">{num(r.n)}</span>
        </div>
      ))}
      {top.length === 0 && <p className="text-xs text-slate-400">No data yet</p>}
    </div>
  );
}
function DaysSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}
      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 outline-none">
      <option value={7}>7 days</option>
      <option value={30}>30 days</option>
      <option value={90}>90 days</option>
    </select>
  );
}

/*
 * CEO PULSE
 * */
function CeoPulse() {
  const { data, isLoading, isFetching, refetch } = useAdminIntelCeoQuery(undefined, { pollingInterval: 15000 });
  if (isLoading) return <PageLoader />;
  const d = data || {};
  return (
    <div className="space-y-6">
      <SectionHeader title="CEO Pulse" subtitle="One screen — live business, growth and where to expand next.">
        <button onClick={refetch} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </SectionHeader>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Live Users" value={num(d.liveUsers)} Icon={Wifi} color="text-emerald-600" bg="bg-emerald-50" sub="active right now" />
        <StatCard label="Live Orders" value={num(d.liveOrders)} Icon={ShoppingBag} color="text-blue-600" bg="bg-blue-50" sub="in progress" />
        <StatCard label="Online Workers" value={num(d.onlineWorkers)} Icon={Briefcase} color="text-violet-600" bg="bg-violet-50" />
        <StatCard label="Revenue Today" value={inr(d.revenueToday)} Icon={IndianRupee} color="text-amber-600" bg="bg-amber-50"
          sub={<Delta pct={d.revenueGrowthPct ?? 0} />} />
        <StatCard label="Unmet Today" value={num(d.unmetToday)} Icon={MapPinOff} color="text-red-600" bg="bg-red-50" sub="no-service requests" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Search size={15} className="text-indigo-500" /> Top Demand Categories (30d)</p>
          <MiniBars rows={(d.topCategories || []).map((c) => ({ label: c.category?.replace(/_/g, ' '), n: c.searches }))} />
        </Card>
        <Card className="p-5">
          <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Globe size={15} className="text-blue-500" /> Top Cities by Demand (30d)</p>
          <MiniBars rows={(d.topCities || []).map((c) => ({ label: c.city, n: c.searches }))} color="#2563eb" />
        </Card>
      </div>

      <Card className="p-5">
        <p className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Rocket size={15} className="text-violet-500" /> Where to Launch Next</p>
        {(d.expansionTop || []).length === 0 ? (
          <p className="text-xs text-slate-400">Not enough demand signal yet — data accrues as visitors search.</p>
        ) : (
          <div className="space-y-2">
            {d.expansionTop.map((c, i) => (
              <div key={`${c.city}-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 font-black flex items-center justify-center text-sm">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{c.city}{c.state ? `, ${c.state}` : ''}</p>
                  <p className="text-[11px] text-slate-500 truncate">{c.recommendation}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-violet-600 tabular-nums">{c.score}</p>
                  <p className="text-[10px] text-slate-400">score</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* Visitor locations history — "where visitors come from" */
function VisitorLocations() {
  const [days, setDays] = useState(7);
  const { data, isLoading } = useAdminIntelVisitorLocationsQuery(days);
  const d = data || {};
  const locs = d.locations || [];
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={15} className="text-blue-500 shrink-0" />
          <p className="text-sm font-bold text-slate-700">Where visitors come from</p>
          {d.total > 0 && <span className="text-[11px] text-slate-400 truncate">· {num(d.located)}/{num(d.total)} located</span>}
        </div>
        <DaysSelect value={days} onChange={setDays} />
      </div>
      {isLoading ? <PageLoader /> : locs.length === 0 ? (
        <EmptyState message="No visitor locations yet — they fill in as people browse" icon={Globe} />
      ) : (
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-white"><tr>
              <Th>#</Th><Th>City</Th><Th>State</Th><Th right>Visitors</Th><Th right>Share</Th><Th right>Mobile</Th><Th>Last seen</Th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {locs.map((l, i) => (
                <tr key={`${l.city}-${l.state}-${i}`} className="hover:bg-slate-50">
                  <Td muted>{i + 1}</Td>
                  <Td><span className="font-semibold text-slate-800">{l.city || 'Unknown'}</span></Td>
                  <Td muted>{l.state || '—'}</Td>
                  <Td right><span className="font-bold text-blue-600">{num(l.visitors)}</span></Td>
                  <Td right>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="hidden sm:block w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <span className="block h-full bg-blue-500" style={{ width: `${l.sharePct}%` }} />
                      </span>
                      {l.sharePct}%
                    </span>
                  </Td>
                  <Td right muted>{l.mobilePct}%</Td>
                  <Td muted>{l.lastSeen ? new Date(l.lastSeen).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/*
 * LIVE TRAFFIC
 * */
function LiveTraffic() {
  const [poll, setPoll] = useState(5000);
  const { data, isLoading } = useAdminIntelLiveTrafficQuery(undefined, { pollingInterval: poll });
  if (isLoading) return <PageLoader />;
  const d = data || {};
  const b = d.breakdown || {};
  return (
    <div className="space-y-6">
      <SectionHeader title="Live Traffic" subtitle={d.at ? `Updated ${new Date(d.at).toLocaleTimeString('en-IN')}` : undefined}>
        <select value={poll} onChange={(e) => setPoll(Number(e.target.value))}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 outline-none">
          <option value={3000}>3s</option><option value={5000}>5s</option><option value={10000}>10s</option><option value={0}>Manual</option>
        </select>
      </SectionHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active Right Now" value={num(d.activeNow)} Icon={Wifi} color="text-emerald-600" bg="bg-emerald-50" sub="last 60s" />
        <StatCard label="Visitors Today" value={num(d.today)} Icon={Activity} color="text-blue-600" bg="bg-blue-50" />
        <StatCard label="This Week" value={num(d.week)} Icon={TrendingUp} color="text-violet-600" bg="bg-violet-50" />
        <StatCard label="This Month" value={num(d.month)} Icon={BarChart2} color="text-amber-600" bg="bg-amber-50" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5"><p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Smartphone size={13} /> Device (30m)</p><MiniBars rows={b.device} color="#10b981" /></Card>
        <Card className="p-5"><p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Monitor size={13} /> Browser (today)</p><MiniBars rows={b.browser} color="#6366f1" /></Card>
        <Card className="p-5"><p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Globe size={13} /> Top Cities (today)</p><MiniBars rows={b.city} color="#2563eb" /></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <Radio size={15} className="text-emerald-500" />
          <p className="text-sm font-bold text-slate-700">Live Visitors ({d.live?.length || 0})</p>
          <span className="ml-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        {(d.live || []).length === 0 ? (
          <EmptyState message="No visitors active in the last 5 minutes" icon={Radio} />
        ) : (
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0"><tr>
                <Th>Page</Th><Th>On page</Th><Th>Type</Th><Th>Device</Th><Th>Browser / OS</Th><Th>Referrer</Th><Th>Location</Th><Th right>Pages</Th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {d.live.map((v, i) => (
                  <tr key={`${v.sessionId}-${i}`} className="hover:bg-slate-50">
                    <Td mono>{v.path}</Td>
                    <Td muted>{dwell(v.dwellSec)}</Td>
                    <Td><span className="text-[11px] font-semibold capitalize px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{v.userType}</span></Td>
                    <Td muted>{v.device}</Td>
                    <Td muted>{v.browser} · {v.os}</Td>
                    <Td muted>{v.referrer}</Td>
                    <Td muted>{[v.city, v.state].filter(Boolean).join(', ') || '—'}</Td>
                    <Td right>{v.pageCount}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Location history — which areas visitors come from most */}
      <VisitorLocations />
    </div>
  );
}

/*
 * UNMET DEMAND (No Service Available)
 * */
function UnmetDemand() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useAdminIntelUnmetDemandQuery(days);
  if (isLoading) return <PageLoader />;
  const d = data || {};
  return (
    <div className="space-y-6">
      <SectionHeader title="Unmet Demand — No Service Available" subtitle="Where customers wanted us but found no coverage. This is your expansion map.">
        <DaysSelect value={days} onChange={setDays} />
      </SectionHeader>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Lost Bookings" value={num(d.lostBookings)} Icon={MapPinOff} color="text-red-600" bg="bg-red-50" sub="no-service searches" />
        <StatCard label="Potential Revenue Lost" value={inr(d.potentialRevenueLost)} Icon={IndianRupee} color="text-amber-600" bg="bg-amber-50" sub="if served" />
        <StatCard label="Hotspot Areas" value={num((d.topAreas || []).length)} Icon={Globe} color="text-violet-600" bg="bg-violet-50" />
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><p className="text-sm font-bold text-slate-700">Top Unmet-Demand Areas</p></div>
        {(d.topAreas || []).length === 0 ? (
          <EmptyState message="No 'No Service Available' events captured yet" icon={MapPinOff} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><Th>Area</Th><Th>Requests</Th><Th>Categories wanted</Th><Th right>Est. revenue lost</Th><Th>Action</Th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {d.topAreas.map((a, i) => (
                  <tr key={`${a.city}-${i}`} className="hover:bg-slate-50">
                    <Td><span className="font-semibold text-slate-800">{a.city}</span>{a.state ? <span className="text-slate-400">, {a.state}</span> : null}</Td>
                    <Td><span className="font-bold text-red-600">{num(a.requests)}</span></Td>
                    <Td muted>{a.categories.map((c) => c.replace(/_/g, ' ')).join(', ')}</Td>
                    <Td right>{inr(a.estLostRevenue)}</Td>
                    <Td><span className="text-[11px] font-bold text-violet-600 bg-violet-50 px-2 py-1 rounded-lg">Launch {a.categories[0]?.replace(/_/g, ' ') || 'service'}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <p className="text-sm font-bold text-slate-700 mb-3">Categories with No Coverage</p>
        {(d.topCategories || []).length === 0 ? <p className="text-xs text-slate-400">No data yet.</p> : (
          <div className="space-y-2">
            {d.topCategories.map((c) => (
              <div key={c.category} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span className="text-xs font-semibold text-slate-700 capitalize">{c.category?.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-red-500 font-bold">{num(c.requests)} req</span>
                  <span className="text-[11px] text-amber-600 font-bold">{inr(c.lostRevenue)} lost</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/*
 * EXPANSION ENGINE
 * */
function ScoreBar({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-16 capitalize">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-violet-400" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
function ExpansionEngine() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useAdminIntelExpansionQuery(days);
  if (isLoading) return <PageLoader />;
  const cities = data?.cities || [];
  return (
    <div className="space-y-6">
      <SectionHeader title="City Expansion Engine" subtitle="AI Expansion Score = demand + unmet + revenue + growth + supply gap. Where to launch next.">
        <DaysSelect value={days} onChange={setDays} />
      </SectionHeader>

      {cities.length === 0 ? (
        <EmptyState message="No expansion candidates yet — demand data accrues as visitors search by location." icon={Rocket} />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {cities.map((c, i) => (
            <Card key={`${c.city}-${i}`} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center text-sm">{i + 1}</div>
                  <div>
                    <p className="font-bold text-slate-900">{c.city}{c.state ? <span className="text-slate-400 font-normal">, {c.state}</span> : null}</p>
                    <p className="text-[11px] text-slate-500">{num(c.demand)} searches · {num(c.unmetRequests)} unmet · {c.approvedWorkers} workers</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-violet-600 tabular-nums leading-none">{c.score}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Expansion Score</p>
                </div>
              </div>
              <div className="space-y-1.5 mb-3">
                <ScoreBar label="demand" value={c.breakdown.demand} />
                <ScoreBar label="unmet" value={c.breakdown.unmet} />
                <ScoreBar label="revenue" value={c.breakdown.revenue} />
                <ScoreBar label="growth" value={c.breakdown.growth} />
                <ScoreBar label="supply gap" value={c.breakdown.supplyGap} />
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <p className="text-[11px] text-slate-600 flex-1 pr-3">{c.recommendation}</p>
                <span className="text-[11px] font-bold text-emerald-600 shrink-0">{inr(c.estMonthlyRevenue)}/mo</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/*
 * CONVERSION FUNNEL
 * */
function ConversionFunnel() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useAdminIntelFunnelQuery(days);
  if (isLoading) return <PageLoader />;
  const d = data || {};
  const stages = d.stages || [];
  return (
    <div className="space-y-6">
      <SectionHeader title="Conversion Funnel" subtitle="Visitor → search → booking → worker → completed. See exactly where you lose people.">
        <DaysSelect value={days} onChange={setDays} />
      </SectionHeader>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Overall Conversion" value={`${d.overallConvPct ?? 0}%`} Icon={TrendingUp} color="text-emerald-600" bg="bg-emerald-50" sub="visitor → completed" />
        <StatCard label="Booking → Completed" value={`${d.bookingCompletionPct ?? 0}%`} Icon={ShoppingBag} color="text-blue-600" bg="bg-blue-50" />
        <StatCard label="Biggest Drop-off" value={d.biggestDrop ? `${d.biggestDrop.dropPct}%` : '—'} Icon={Filter} color="text-red-600" bg="bg-red-50" sub={d.biggestDrop?.label} />
      </div>

      <Card className="p-5 space-y-3">
        {stages.length === 0 ? (
          <p className="text-xs text-slate-400">No funnel data yet — it builds as visitors browse, search and book.</p>
        ) : stages.map((s, i) => (
          <div key={s.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-slate-700">{s.label}</span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">
                {num(s.count)}
                {i > 0 && <span className="text-[11px] font-medium text-slate-400 ml-2">{s.convFromPrev}% of prev</span>}
              </span>
            </div>
            <div className="h-7 rounded-lg bg-slate-100 overflow-hidden">
              <div className="h-full rounded-lg flex items-center px-2" style={{ width: `${Math.max(s.pctOfTop, 4)}%`, background: 'linear-gradient(#6366f1, #6366f1)' }}>
                <span className="text-[10px] font-bold text-white">{s.pctOfTop}%</span>
              </div>
            </div>
            {i > 0 && s.dropPct > 0 && (
              <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                <ArrowDownRight size={11} />{s.dropPct}% dropped off after {stages[i - 1].label}
              </p>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

/*
 * BUSINESS REPORT (+ CSV download)
 * */
function downloadReportCsv(r) {
  const rows = [
    ['Zappy Business Report', r.windowLabel || ''],
    ['Generated', new Date(r.generatedAt || Date.now()).toLocaleString('en-IN')],
    [],
    ['Metric', 'Value'],
    ['Visitors', r.visitors], ['Bookings', r.bookings], ['Completed', r.completed],
    ['Revenue (INR)', r.revenue], ['Revenue growth %', r.revenueGrowthPct], ['Completion rate %', r.completionRatePct],
    [],
    ['Top Categories', 'Orders'],
    ...(r.topCategories || []).map((c) => [c.category, c.orders]),
    [],
    ['Top Cities', 'Orders', 'Revenue (INR)'],
    ...(r.topCities || []).map((c) => [c.city, c.orders, c.revenue]),
    [],
    ['No-Service Areas', 'Requests'],
    ...(r.noServiceAreas || []).map((a) => [`${a.city}${a.state ? ', ' + a.state : ''}`, a.requests]),
    [],
    ['Top Workers', 'Jobs', 'Earned (INR)', 'Rating'],
    ...(r.topWorkers || []).map((w) => [w.name, w.jobs, w.earnedRupees, w.rating]),
  ];
  const csv = rows.map((row) => row.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `zappy-report-${r.period || 'daily'}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ListCard({ title, Icon, rows, empty }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Icon size={15} className="text-indigo-500" />{title}</p>
      {(!rows || rows.length === 0) ? <p className="text-xs text-slate-400">{empty}</p> : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
              <span className="text-xs font-semibold text-slate-700 truncate">{r.left}</span>
              <span className="text-xs font-bold text-slate-900 shrink-0 ml-2">{r.right}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function BusinessReport() {
  const [period, setPeriod] = useState('daily');
  const { data, isLoading } = useAdminIntelReportQuery(period);
  if (isLoading) return <PageLoader />;
  const d = data || {};
  return (
    <div className="space-y-6">
      <SectionHeader title="Business Report" subtitle={`${d.windowLabel || ''} · auto-generated snapshot`}>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 outline-none">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <button onClick={() => downloadReportCsv(d)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700">
            <Download size={12} /> CSV
          </button>
        </div>
      </SectionHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Visitors" value={num(d.visitors)} Icon={Wifi} color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard label="Bookings" value={num(d.bookings)} Icon={ShoppingBag} color="text-blue-600" bg="bg-blue-50" sub={`${d.completed ?? 0} completed`} />
        <StatCard label="Revenue" value={inr(d.revenue)} Icon={IndianRupee} color="text-amber-600" bg="bg-amber-50" sub={<Delta pct={d.revenueGrowthPct ?? 0} />} />
        <StatCard label="Completion" value={`${d.completionRatePct ?? 0}%`} Icon={TrendingUp} color="text-violet-600" bg="bg-violet-50" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ListCard title="Top Categories" Icon={Search} empty="No orders in window"
          rows={(d.topCategories || []).map((c) => ({ left: (c.category || '').replace(/_/g, ' '), right: `${num(c.orders)} orders` }))} />
        <ListCard title="Top Cities" Icon={Globe} empty="No located orders yet"
          rows={(d.topCities || []).map((c) => ({ left: c.city, right: `${num(c.orders)} · ${inr(c.revenue)}` }))} />
        <ListCard title="No-Service Areas" Icon={MapPinOff} empty="No unmet demand captured"
          rows={(d.noServiceAreas || []).map((a) => ({ left: `${a.city}${a.state ? ', ' + a.state : ''}`, right: `${num(a.requests)} req` }))} />
        <ListCard title="Top Workers" Icon={Star} empty="No completed jobs in window"
          rows={(d.topWorkers || []).map((w) => ({ left: `${w.name} · ${w.jobs} jobs`, right: inr(w.earnedRupees) }))} />
      </div>
    </div>
  );
}

/*
 * PARTNER ANALYTICS (event partners ranked)
 * */
function PartnerPerformance() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useAdminIntelPartnersQuery(days);
  if (isLoading) return <PageLoader />;
  const d = data || {};
  const partners = d.partners || [];
  const t = d.totals || {};
  return (
    <div className="space-y-6">
      <SectionHeader title="Partner Analytics" subtitle="Event partners ranked by revenue, bookings and completion rate.">
        <DaysSelect value={days} onChange={setDays} />
      </SectionHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active Partners" value={num(d.totalPartners)} Icon={Users} color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard label="Bookings" value={num(t.bookings)} Icon={ShoppingBag} color="text-blue-600" bg="bg-blue-50" sub={`${num(t.completed)} completed`} />
        <StatCard label="Partner Revenue" value={inr(t.revenue)} Icon={IndianRupee} color="text-amber-600" bg="bg-amber-50" />
        <StatCard label="Completion" value={`${t.bookings ? Math.round((t.completed / t.bookings) * 100) : 0}%`} Icon={TrendingUp} color="text-emerald-600" bg="bg-emerald-50" />
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><p className="text-sm font-bold text-slate-700">Partner Leaderboard</p></div>
        {partners.length === 0 ? (
          <EmptyState message="No event partner bookings in this window" icon={Users} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><Th>#</Th><Th>Partner</Th><Th right>Rating</Th><Th right>Bookings</Th><Th right>Completed</Th><Th right>Completion</Th><Th right>Revenue</Th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {partners.map((p) => (
                  <tr key={p.rank} className="hover:bg-slate-50">
                    <Td muted>{p.rank}</Td>
                    <Td><span className="font-semibold text-slate-800">{p.name}</span></Td>
                    <Td right><span className="inline-flex items-center gap-1"><Star size={11} className="fill-amber-400 text-amber-400" />{(p.rating || 0).toFixed(1)}</span></Td>
                    <Td right>{num(p.bookings)}</Td>
                    <Td right muted>{num(p.completed)}{p.cancelled > 0 && <span className="text-red-400 ml-1">· {p.cancelled} cx</span>}</Td>
                    <Td right><span className={`font-bold ${p.completionPct >= 80 ? 'text-emerald-600' : p.completionPct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{p.completionPct}%</span></Td>
                    <Td right><span className="font-bold text-blue-600">{inr(p.revenueRupees)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/*
 * HUB SHELL — title + dropdown
 * */
const VIEWS = [
  { id: 'ceo',       label: 'CEO Pulse',          icon: Crown,     Comp: CeoPulse },
  { id: 'traffic',   label: 'Live Traffic',       icon: Radio,     Comp: LiveTraffic },
  { id: 'search',    label: 'Search Demand',      icon: Search,    Comp: SearchIntel },
  { id: 'unmet',     label: 'Unmet Demand',       icon: MapPinOff, Comp: UnmetDemand },
  { id: 'expansion', label: 'Expansion Engine',   icon: Rocket,    Comp: ExpansionEngine },
  { id: 'funnel',    label: 'Conversion Funnel',  icon: Filter,    Comp: ConversionFunnel },
  { id: 'partners',  label: 'Partner Analytics',  icon: Users,     Comp: PartnerPerformance },
  { id: 'report',    label: 'Business Report',    icon: FileText,  Comp: BusinessReport },
  { id: 'geo',       label: 'Geo / Heatmap',      icon: Globe,     Comp: Heatmap },
  { id: 'business',  label: 'Business Intel',     icon: TrendingUp, Comp: BusinessIntelligence },
  { id: 'analytics', label: 'Deep Analytics',     icon: BarChart2, Comp: Analytics },
  { id: 'retention', label: 'Retention & Cohorts', icon: Users,     Comp: Retention },
];

export default function Intelligence() {
  const [params, setParams] = useSearchParams();
  const sub = params.get('sub') || 'ceo';
  const active = VIEWS.find((v) => v.id === sub) || VIEWS[0];
  const [open, setOpen] = useState(false);
  const ActiveComp = active.Comp;
  const ActiveIcon = active.icon;

  function pick(id) {
    const next = new URLSearchParams(params);
    next.set('tab', 'insights');
    next.set('sub', id);
    setParams(next, { replace: true });
    setOpen(false);
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Title + dropdown */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(#6366f1, #6366f1)' }}>
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 leading-none">Insights</h1>
            <p className="text-xs text-slate-400 mt-1">Live demand → data-driven hiring, marketing &amp; city launches</p>
          </div>
        </div>

        <div className="relative">
          <button onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-sm text-sm font-bold text-slate-800 hover:border-slate-300">
            <ActiveIcon size={15} className="text-indigo-500" />
            {active.label}
            <ChevronDown size={15} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl border border-slate-100 shadow-xl z-20 p-1.5">
                {VIEWS.map((v) => {
                  const Icon = v.icon;
                  return (
                    <button key={v.id} onClick={() => pick(v.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-left transition ${
                        v.id === active.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                      <Icon size={15} className={v.id === active.id ? 'text-indigo-500' : 'text-slate-400'} />
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <ActiveComp />
    </div>
  );
}
