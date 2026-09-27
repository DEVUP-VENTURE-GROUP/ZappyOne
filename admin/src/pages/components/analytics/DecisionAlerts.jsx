import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function DecisionAlerts({ d, ops }) {
  const alerts = [];
  if (d.totalOrders > 0) {
    if ((d.cancelRate || 0) > 25)
      alerts.push({ sev: 'red',   msg: `Cancel rate is ${d.cancelRate}% — investigate top cancelled services` });
    if ((d.completionRate || 0) < 60)
      alerts.push({ sev: 'red',   msg: `Only ${d.completionRate}% orders completed — worker supply may be low` });
    if (d.changes?.revenue != null && d.changes.revenue < -20)
      alerts.push({ sev: 'red',   msg: `Revenue down ${Math.abs(d.changes.revenue)}% vs previous period` });
    if (ops?.avgDispatchMin != null && ops.avgDispatchMin > 15)
      alerts.push({ sev: 'amber', msg: `Avg dispatch time ${ops.avgDispatchMin}min — workers taking too long to accept` });
    if (d.changes?.orders != null && d.changes.orders > 20)
      alerts.push({ sev: 'green', msg: `Orders up ${d.changes.orders}% — consider adding workers to handle demand` });
    if ((d.cancelRate || 0) <= 10 && (d.completionRate || 0) >= 80)
      alerts.push({ sev: 'green', msg: `Platform performing well — completion ${d.completionRate}%, cancel ${d.cancelRate}%` });
  }
  if (!alerts.length) return null;

  const sev = {
    red:   { bg: 'bg-red-50',     border: 'border-red-200',     icon: 'text-red-500'   },
    amber: { bg: 'bg-amber-50',   border: 'border-amber-200',   icon: 'text-amber-500' },
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-500' },
  };
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const s = sev[a.sev];
        return (
          <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl border ${s.bg} ${s.border}`}>
            {a.sev === 'green'
              ? <CheckCircle2 size={14} className={`mt-0.5 shrink-0 ${s.icon}`} />
              : <AlertCircle  size={14} className={`mt-0.5 shrink-0 ${s.icon}`} />}
            <p className="text-xs font-semibold text-slate-700 leading-relaxed">{a.msg}</p>
          </div>
        );
      })}
    </div>
  );
}
