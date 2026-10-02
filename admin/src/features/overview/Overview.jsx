import { useAdminMetricsQuery, useAdminRevenueQuery } from '@shared/services/api';
import {
  ClipboardList, Activity, CheckCircle2, IndianRupee,
  TrendingUp, Users, UserCheck,
} from 'lucide-react';
import { StatCard, PageLoader, LineSparkline, BarChart, Card, fmt } from '../../ui/kit';

export default function Overview() {
  const { data: m, isLoading } = useAdminMetricsQuery();
  const { data: rev } = useAdminRevenueQuery(7);

  if (isLoading) return <PageLoader />;
  if (!m) return null;

  const revenueByDay = rev?.byDay?.map(d => ({ label: d.day?.slice(5), value: d.totalPaise / 100 })) || [];
  const revenueBreakdown = rev?.breakdown?.map(d => ({ label: d.reason, value: d.totalPaise / 100 })) || [];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        <StatCard label="Orders Today"    value={m.ordersToday}    Icon={ClipboardList} color="text-blue-600"   bg="bg-blue-50" />
        <StatCard label="Active Now"      value={m.active}         Icon={Activity}      color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard label="Completed Today" value={m.completedToday} Icon={CheckCircle2}  color="text-green-600"  bg="bg-green-50" />
        <StatCard
          label="Revenue Today"
          value={`₹${(m.revenueToday || 0).toLocaleString('en-IN')}`}
          Icon={IndianRupee} color="text-blue-600" bg="bg-blue-50"
        />
        <StatCard label="Avg Fare"       value={`₹${m.avgFare || 0}`}                            Icon={TrendingUp}  color="text-amber-600"  bg="bg-amber-50" />
        <StatCard label="Online Workers" value={`${m.onlineWorkers}/${m.totalWorkers}`}           Icon={UserCheck}   color="text-purple-600" bg="bg-purple-50" />
        <StatCard label="Total Users"    value={(m.totalUsers || 0).toLocaleString('en-IN')}      Icon={Users}       color="text-slate-600"  bg="bg-slate-100" />
        <StatCard label="Total Workers"  value={(m.totalWorkers || 0).toLocaleString('en-IN')}    Icon={Users}       color="text-zappy-600" bg="bg-zappy-50" />
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Revenue trend */}
        <Card className="p-5">
          <p className="text-sm font-bold text-slate-700 mb-1">Revenue — last 7 days</p>
          <p className="text-2xl font-extrabold text-slate-900 mb-4">
            {rev ? fmt(rev.totalPaise) : '—'}
          </p>
          <div className="h-16">
            {revenueByDay.length > 1 ? (
              <LineSparkline data={revenueByDay} color="#2563EB" />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">No data yet</div>
            )}
          </div>
          {revenueByDay.length > 0 && (
            <div className="flex justify-between mt-2">
              {revenueByDay.map((d, i) => (
                <span key={i} className="text-[10px] text-slate-400">{d.label}</span>
              ))}
            </div>
          )}
        </Card>

        {/* Revenue by reason */}
        <Card className="p-5">
          <p className="text-sm font-bold text-slate-700 mb-4">Revenue by Type — last 7 days</p>
          {revenueBreakdown.length > 0 ? (
            <div className="space-y-2">
              {revenueBreakdown.slice(0, 5).map((d) => (
                <div key={d.label} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-40 truncate capitalize">{d.label?.replace(/_/g, ' ')}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-blue-500 transition-all"
                      style={{ width: `${Math.min((d.value / (revenueBreakdown[0]?.value || 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-20 text-right">₹{d.value.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-16 flex items-center justify-center text-xs text-slate-400">No revenue data yet</div>
          )}
        </Card>
      </div>

      {/* Daily bar chart */}
      {revenueByDay.length > 1 && (
        <Card className="p-5">
          <p className="text-sm font-bold text-slate-700 mb-4">Daily Revenue (₹) — last 7 days</p>
          <div className="relative pt-8">
            <BarChart data={revenueByDay} valueKey="value" labelKey="label" color="#2563EB" height={80} />
            <div className="flex justify-between mt-2">
              {revenueByDay.map((d, i) => (
                <span key={i} className="flex-1 text-center text-[10px] text-slate-400">{d.label}</span>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
