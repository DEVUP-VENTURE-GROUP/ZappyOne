import { Zap, Clock, Briefcase } from 'lucide-react';

export default function OpsPanel({ ops }) {
  const items = [
    { label: 'Dispatch time',  desc: 'Order → Worker assigned', value: ops?.avgDispatchMin, bench: 10, icon: Zap },
    { label: 'Wait at site',   desc: 'Arrive → Service starts',  value: ops?.avgWaitMin,     bench: 5,  icon: Clock },
    { label: 'Service time',   desc: 'Start → Completed',        value: ops?.avgServiceMin,  bench: 60, icon: Briefcase },
  ];
  return (
    <div className="space-y-3">
      {items.map(({ label, desc, value, bench, icon: Icon }) => {
        const pct  = value != null ? Math.min((value / (bench * 2)) * 100, 100) : 0;
        const good = value != null ? value <= bench : null;
        return (
          <div key={label} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${good == null ? 'bg-slate-50' : good ? 'bg-emerald-50' : 'bg-amber-50'}`}>
              <Icon size={14} className={good == null ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-amber-600'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700">{label}</p>
              <p className="text-[10px] text-slate-400">{desc}</p>
              <div className="bg-slate-100 rounded-full h-1 mt-1 overflow-hidden">
                <div className={`h-1 rounded-full ${good ? 'bg-emerald-500' : good === false ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="text-right shrink-0">
              {value != null
                ? <><p className="text-sm font-extrabold text-slate-800">{value}m</p><p className={`text-[10px] font-bold ${good ? 'text-emerald-500' : 'text-amber-500'}`}>{good ? '✓ fast' : `>${bench}m`}</p></>
                : <p className="text-xs text-slate-400">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
