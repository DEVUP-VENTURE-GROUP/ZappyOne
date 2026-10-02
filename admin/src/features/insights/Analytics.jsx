import { useState } from 'react';
import { useAdminAnalyticsQuery, useAdminMetricsQuery, useAdminDemandPatternsQuery, useAdminOtpAnalyticsQuery } from '@shared/services/api';
import { SectionHeader, Card, PageLoader } from '../../ui/kit';
import {
  IndianRupee, ShoppingBag, CheckCircle2, XCircle, Zap,
  ArrowUpRight, RefreshCw, AlertTriangle, MessageSquare,
} from 'lucide-react';
import HealthCard, { computeHealth }  from './components/analytics/HealthCard';
import KpiCard                         from './components/analytics/KpiCard';
import RevenueTrend                    from './components/analytics/RevenueTrend';
import LeakagePanel                    from './components/analytics/LeakagePanel';
import ServiceMatrix                   from './components/analytics/ServiceMatrix';
import SupplyDemand                    from './components/analytics/SupplyDemand';
import OpsPanel                        from './components/analytics/OpsPanel';
import WorkerLeaderboard               from './components/analytics/WorkerLeaderboard';
import WeeklySignups                   from './components/analytics/WeeklySignups';
import DecisionAlerts                  from './components/analytics/DecisionAlerts';

function fmtR(rupees) {
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000)   return `₹${(rupees / 1000).toFixed(1)}K`;
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
}

const DAY_OPTIONS = [7, 14, 30, 60, 90];

const OTP_DAY_OPTIONS = [7, 14, 30];

function OtpAnalyticsCard() {
  const [otpDays, setOtpDays] = useState(7);
  const { data: otp, isFetching: otpFetching } = useAdminOtpAnalyticsQuery(otpDays);
  const t = otp?.totals || {};
  const r = otp?.rates  || {};
  const byDay = otp?.byDay || [];

  const rows = [
    { label: 'Sent',      value: t.sent    || 0, color: 'text-blue-600',    bg: 'bg-blue-50' },
    { label: 'Verified',  value: t.verified || 0, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Failed',    value: t.failed   || 0, color: 'text-red-500',     bg: 'bg-red-50' },
    { label: 'Resent',    value: t.resent   || 0, color: 'text-amber-600',   bg: 'bg-amber-50' },
    { label: 'Blocked',   value: t.blocked  || 0, color: 'text-slate-500',   bg: 'bg-slate-100' },
  ];

  const maxBar = Math.max(...byDay.map(d => d.sent || 0), 1);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-zappy-500" />
          <p className="text-sm font-bold text-slate-800">OTP Analytics</p>
        </div>
        <div className="flex items-center gap-1.5">
          {OTP_DAY_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setOtpDays(opt)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${otpDays === opt ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {opt}d
            </button>
          ))}
          {otpFetching && <RefreshCw size={12} className="animate-spin text-slate-400" />}
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">SMS delivery health — sent / verified / failed per day</p>

      <div className="grid grid-cols-5 gap-2 mb-4">
        {rows.map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-xl p-3 text-center ${bg}`}>
            <p className={`text-lg font-extrabold tabular-nums ${color}`}>{value.toLocaleString('en-IN')}</p>
            <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4 text-xs font-semibold mb-4">
        <span className="text-emerald-600">Success {r.successRate ?? 0}%</span>
        <span className="text-red-500">Failure {r.failureRate ?? 0}%</span>
        <span className="text-amber-600">Resend {r.resendRate ?? 0}%</span>
      </div>

      {byDay.length > 0 && (
        <div className="space-y-1">
          {byDay.map(row => (
            <div key={row.date} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-20 shrink-0">{row.date?.slice(5)}</span>
              <div className="flex-1 flex gap-0.5 h-4">
                <div className="bg-blue-400 rounded-sm" style={{ width: `${((row.sent || 0) / maxBar) * 100}%` }} title={`Sent: ${row.sent}`} />
                <div className="bg-emerald-400 rounded-sm" style={{ width: `${((row.verified || 0) / maxBar) * 100}%` }} title={`Verified: ${row.verified}`} />
                <div className="bg-red-400 rounded-sm" style={{ width: `${((row.failed || 0) / maxBar) * 100}%` }} title={`Failed: ${row.failed}`} />
              </div>
              <span className="text-[10px] text-slate-400 w-6 text-right">{row.sent || 0}</span>
            </div>
          ))}
          <div className="flex gap-3 mt-2 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400 inline-block" />Sent</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />Verified</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" />Failed</span>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isFetching, isError, error, refetch } = useAdminAnalyticsQuery(days);
  const { data: live }     = useAdminMetricsQuery(undefined, { pollingInterval: 30000 });
  const { data: patterns } = useAdminDemandPatternsQuery({ days });

  if (isLoading) return <PageLoader />;

  const d   = data || {};
  const ops = d.ops || {};
  const score = computeHealth(d, ops);

  return (
    <div className="space-y-5">
      <SectionHeader title="Analytics" subtitle={`Last ${days} days vs previous ${days} days`}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {DAY_OPTIONS.map(opt => (
              <button key={opt} onClick={() => setDays(opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${days===opt ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {opt}d
              </button>
            ))}
          </div>
          <button onClick={refetch} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </SectionHeader>

      {isError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertTriangle size={16} className="text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700">Analytics API error</p>
            <p className="text-xs text-red-500">{error?.data?.message || error?.status || 'Could not load data'}</p>
          </div>
        </div>
      )}

      {live && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-5 py-3.5 flex flex-wrap items-center gap-x-8 gap-y-3">
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 pr-2 border-r border-slate-100">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Live Now
          </span>
          {[
            { label: 'Active orders',   value: live.active,                                              color: 'text-blue-600' },
            { label: 'Online workers',  value: `${live.onlineWorkers}/${live.totalWorkers}`,             color: 'text-emerald-600' },
            { label: 'Orders today',    value: live.ordersToday,                                         color: 'text-orange-600' },
            { label: 'Completed today', value: live.completedToday,                                      color: 'text-zappy-600' },
            { label: 'Revenue today',   value: `₹${(live.revenueToday || 0).toLocaleString('en-IN')}`,   color: 'text-amber-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col leading-tight">
              <span className={`text-xl font-extrabold tabular-nums ${color}`}>{value}</span>
              <span className="text-[11px] text-slate-500 font-medium">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="col-span-2 sm:col-span-3 xl:col-span-1">
          <HealthCard score={score} d={d} ops={ops} />
        </div>
        <KpiCard label="Revenue"         value={fmtR(d.totalRevRupees || 0)}              Icon={IndianRupee}  color="text-blue-600"    bg="bg-blue-50"    pct={d.changes?.revenue} />
        <KpiCard label="Total Orders"    value={(d.totalOrders || 0).toLocaleString()}     Icon={ShoppingBag}  color="text-orange-600"  bg="bg-orange-50"  pct={d.changes?.orders} />
        <KpiCard label="Completed"       value={(d.completedOrders || 0).toLocaleString()} Icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" pct={d.changes?.completed} />
        <KpiCard label="Cancel Rate"     value={`${d.cancelRate || 0}%`}                   Icon={XCircle}      color="text-red-500"     bg="bg-red-50" />
        <KpiCard label="Avg Order Value" value={fmtR(d.avgFareRupees || 0)}                Icon={Zap}          color="text-amber-600"   bg="bg-amber-50"   pct={d.changes?.avgFare} />
      </div>

      <DecisionAlerts d={d} ops={ops} />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <p className="text-sm font-bold text-slate-800 mb-0.5">Revenue & Order Trend</p>
          <p className="text-xs text-slate-400 mb-3">Daily totals for the period</p>
          <RevenueTrend data={d.dailyTrend || []} />
        </Card>
        <Card className="p-5">
          <p className="text-sm font-bold text-slate-800 mb-0.5">Revenue Intelligence</p>
          <p className="text-xs text-slate-400 mb-3">Captured vs lost revenue</p>
          <LeakagePanel d={d} />
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-slate-800">Service Health Matrix</p>
          <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">Demand × Quality quadrant</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">Where each service sits — use this to decide where to invest or cut</p>
        <ServiceMatrix services={d.serviceBreakdown || []} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-sm font-bold text-slate-800 mb-0.5">Supply-Demand Gap</p>
          <p className="text-xs text-slate-400 mb-3">Red bars = peak hours where supply likely insufficient</p>
          <SupplyDemand hourly={patterns?.hourly || []} onlineWorkers={live?.onlineWorkers || 0} />
        </Card>
        <Card className="p-5">
          <p className="text-sm font-bold text-slate-800 mb-0.5">Operational Efficiency</p>
          <p className="text-xs text-slate-400 mb-4">Avg time per stage across completed orders</p>
          <OpsPanel ops={ops} />
          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
            <div className="text-center">
              <p className="text-lg font-extrabold text-slate-900">{(d.uniqueActiveUsers || 0).toLocaleString('en-IN')}</p>
              <p className="text-[10px] font-semibold text-slate-400">Active Users</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-extrabold text-slate-900">{(d.newUsers || 0).toLocaleString('en-IN')}</p>
              <p className="text-[10px] font-semibold text-slate-400">New Signups</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <p className="text-sm font-bold text-slate-800 mb-0.5">Worker Leaderboard</p>
          <p className="text-xs text-slate-400 mb-4">Top performers by jobs completed</p>
          <WorkerLeaderboard workers={d.topWorkers || []} />
        </Card>
        <Card className="p-5">
          <p className="text-sm font-bold text-slate-800 mb-0.5">Weekly Growth</p>
          <p className="text-xs text-slate-400 mb-4">New users & workers per week</p>
          <WeeklySignups weeklySignups={d.weeklySignups} />
        </Card>
      </div>

      <OtpAnalyticsCard />
    </div>
  );
}
