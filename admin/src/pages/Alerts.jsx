import { useState } from 'react';
import { useAdminAlertsQuery } from '@shared/services/api';
import { SectionHeader, Card, PageLoader } from './_shared';
import { AlertTriangle, CheckCircle2, XCircle, RefreshCw, Users, ShoppingBag, Clock } from 'lucide-react';

const SEVERITY_STYLE = {
  critical: { border: 'border-red-300',    bg: 'bg-red-50',     text: 'text-red-800',     badge: 'bg-red-100 text-red-700',     icon: XCircle },
  warning:  { border: 'border-amber-300',  bg: 'bg-amber-50',   text: 'text-amber-800',   badge: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  ok:       { border: 'border-green-200',  bg: 'bg-green-50',   text: 'text-green-800',   badge: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

export default function Alerts() {
  const [pollInterval] = useState(15000);
  const { data, isLoading, isFetching, refetch } = useAdminAlertsQuery(undefined, {
    pollingInterval: pollInterval,
  });

  if (isLoading) return <PageLoader />;

  const alerts   = data?.alerts || [];
  const snap     = data?.snapshot || {};
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const warning  = alerts.filter(a => a.severity === 'warning').length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Alerts"
        subtitle={data?.checkedAt ? `Live · refreshes every 15s · last: ${new Date(data.checkedAt).toLocaleTimeString('en-IN')}` : undefined}
      >
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition"
        >
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </SectionHeader>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Critical', count: critical, cls: critical > 0 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200' },
          { label: 'Warnings', count: warning,  cls: warning  > 0 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200' },
        ].map(({ label, count, cls }) => (
          <span key={label} className={`border rounded-full px-3 py-1 text-xs font-bold ${cls}`}>
            {count} {label}
          </span>
        ))}
      </div>

      {/* Snapshot metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'Online Workers',   value: snap.onlineWorkers ?? '—', Icon: Users,       color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Active Orders',    value: snap.activeOrders ?? '—',  Icon: ShoppingBag, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Cancels (1h)',     value: snap.recentCancels ?? '—', Icon: XCircle,     color: 'text-red-500',     bg: 'bg-red-50' },
          { label: 'Completed (1h)',   value: snap.recentCompleted ?? '—', Icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Failed Dispatch',  value: snap.failedOrders ?? '—',  Icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Stuck Searching',  value: snap.longSearching ?? '—', Icon: Clock,       color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(({ label, value, Icon, color, bg }) => (
          <Card key={label} className="p-3 flex flex-col items-center text-center">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon size={15} className={color} />
            </div>
            <p className="text-xl font-extrabold text-slate-900 tabular-nums">{value}</p>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-tight">{label}</p>
          </Card>
        ))}
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {alerts.map((alert) => {
          const style = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.ok;
          const Icon  = style.icon;
          return (
            <div key={alert.id} className={`border rounded-xl px-5 py-4 ${style.bg} ${style.border}`}>
              <div className="flex items-start gap-3">
                <Icon size={18} className={style.text} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-bold text-sm ${style.text}`}>{alert.title}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${style.badge}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${style.text} opacity-80`}>{alert.message}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
