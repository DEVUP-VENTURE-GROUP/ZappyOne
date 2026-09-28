import { useState } from 'react';
import { useAdminRetentionQuery } from '@shared/services/api';
import { SectionHeader, Card, PageLoader, LineSparkline, BarChart } from './_shared';
import { Users, Repeat, TrendingUp, Briefcase } from 'lucide-react';

function RetentionGauge({ label, pct, color = 'bg-blue-500' }) {
  return (
    <div>
      <div className="flex justify-between items-end mb-1">
        <span className="text-xs text-slate-500 font-medium">{label}</span>
        <span className="text-sm font-extrabold text-slate-800">{pct}%</span>
      </div>
      <div className="bg-slate-100 rounded-full h-3 overflow-hidden">
        <div
          className={`h-3 rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

const DAY_OPTIONS = [7, 14, 30, 60, 90];

export default function Retention() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useAdminRetentionQuery(days);

  if (isLoading) return <PageLoader />;

  const u  = data?.users   || {};
  const w  = data?.workers || {};
  const dau = (data?.dailyActiveUsers || []).map(d => ({ label: d.date?.slice(5), value: d.dau }));

  return (
    <div className="space-y-6">
      <SectionHeader title="Retention & Cohorts">
        <div className="flex gap-1.5">
          {DAY_OPTIONS.map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${days === d ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {d}d
            </button>
          ))}
        </div>
      </SectionHeader>

      {/* User KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Unique Users',    value: u.total?.toLocaleString('en-IN') || '0',            Icon: Users,      color: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'Repeat Bookers',  value: u.repeatBookers?.toLocaleString('en-IN') || '0',    Icon: Repeat,     color: 'text-violet-600',  bg: 'bg-violet-50' },
          { label: 'Repeat Rate',     value: `${u.repeatRate || 0}%`,                             Icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Active Workers',  value: w.total?.toLocaleString('en-IN') || '0',             Icon: Briefcase,  color: 'text-amber-600',   bg: 'bg-amber-50' },
        ].map(({ label, value, Icon, color, bg }) => (
          <Card key={label} className="p-4">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-2`}>
              <Icon size={16} className={color} />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{value}</p>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* User retention rates */}
      <Card className="p-5">
        <p className="text-sm font-bold text-slate-700 mb-1">User Retention</p>
        <p className="text-xs text-slate-400 mb-4">
          Of unique users in the period, % who returned within D1 / D7 / D30
        </p>
        <div className="space-y-4">
          <RetentionGauge label="D1 Retention (returned within 1 day)"  pct={u.d1Retention  || 0} color="bg-blue-500" />
          <RetentionGauge label="D7 Retention (returned within 7 days)" pct={u.d7Retention  || 0} color="bg-violet-500" />
          <RetentionGauge label="D30 Retention (returned within 30d)"   pct={u.d30Retention || 0} color="bg-emerald-500" />
          <RetentionGauge label="Repeat Booking Rate (>1 order)"        pct={u.repeatRate   || 0} color="bg-amber-500" />
        </div>
      </Card>

      {/* Worker retention */}
      <Card className="p-5">
        <p className="text-sm font-bold text-slate-700 mb-1">Worker Weekly Retention</p>
        <p className="text-xs text-slate-400 mb-4">
          Workers active in 2+ different weeks in the period
        </p>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <RetentionGauge label={`${w.retained || 0} of ${w.total || 0} active workers`} pct={w.weeklyRetentionRate || 0} color="bg-blue-500" />
          </div>
          <div className="text-center shrink-0">
            <p className="text-3xl font-extrabold text-slate-900">{w.weeklyRetentionRate || 0}%</p>
            <p className="text-xs text-slate-400 font-semibold">Weekly retention</p>
          </div>
        </div>
      </Card>

      {/* Daily active users chart */}
      {dau.length > 1 && (
        <Card className="p-5">
          <p className="text-sm font-bold text-slate-700 mb-1">Daily Active Users (DAU)</p>
          <p className="text-xs text-slate-400 mb-4">Unique users placing orders per day</p>
          <div className="h-20">
            <LineSparkline data={dau} color="#6366f1" />
          </div>
          <div className="flex justify-between mt-2">
            {dau.filter((_, i) => i % Math.ceil(dau.length / 6) === 0).map((d, i) => (
              <span key={i} className="text-[10px] text-slate-400">{d.label}</span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
