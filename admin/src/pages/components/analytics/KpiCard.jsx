import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Card } from '../../_shared';

export function TrendBadge({ pct }) {
  if (pct == null) return <span className="text-[10px] text-slate-400">—</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${pct === 0 ? 'bg-slate-100 text-slate-500' : up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
      {pct === 0 ? <Minus size={9} /> : up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(pct)}%
    </span>
  );
}

export default function KpiCard({ label, value, sub, Icon, color, bg, pct }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon size={15} className={color} />
        </div>
        <TrendBadge pct={pct} />
      </div>
      <p className="text-xl font-extrabold text-slate-900 tabular-nums leading-tight">{value}</p>
      <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </Card>
  );
}
