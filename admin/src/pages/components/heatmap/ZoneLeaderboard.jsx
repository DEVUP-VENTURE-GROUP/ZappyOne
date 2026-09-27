import { MapPin, CheckCircle2, XCircle } from 'lucide-react';
import { Card } from '../../_shared';

function ZoneCard({ zone, rank, metric, nameMap }) {
  const coordKey = `${zone.lat},${zone.lng}`;
  const name     = nameMap[coordKey] || zone.name || coordKey;
  const isCoord  = /^\d+\.\d+,\s*\d+/.test(name);
  const mainVal  = metric === 'revenue'
    ? `₹${Math.round(zone.revenue).toLocaleString('en-IN')}`
    : metric === 'cancelRate' ? `${zone.cancelRate}%` : zone.total;
  const rankColors = ['text-amber-500', 'text-slate-400', 'text-amber-700'];
  const rankBg     = ['bg-amber-50 border-amber-200', 'bg-slate-50 border-slate-200', 'bg-orange-50 border-orange-100'];

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition hover:shadow-sm ${rank < 3 ? rankBg[rank] : 'bg-white border-slate-100'}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-extrabold text-xs ${rank < 3 ? rankColors[rank] : 'text-slate-400'}`}>{rank + 1}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate leading-tight" title={name}>
          {isCoord ? <span className="font-mono text-xs text-slate-500">{name}</span> : name}
        </p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {metric !== 'total' && <span className="text-[11px] text-slate-500 flex items-center gap-0.5"><MapPin size={9} />{zone.total} orders</span>}
          <span className="text-[11px] text-emerald-600 flex items-center gap-0.5"><CheckCircle2 size={9} />{zone.completionRate || Math.round(zone.completed / Math.max(zone.total, 1) * 100)}%</span>
          {metric !== 'cancelRate' && zone.cancelRate > 0 && <span className={`text-[11px] flex items-center gap-0.5 ${zone.cancelRate > 40 ? 'text-red-500' : 'text-slate-400'}`}><XCircle size={9} />{zone.cancelRate}% cancel</span>}
          {metric !== 'revenue' && zone.revenue > 0 && <span className="text-[11px] text-blue-600 font-semibold">₹{Math.round(zone.revenue).toLocaleString('en-IN')}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`font-extrabold text-sm tabular-nums ${metric === 'cancelRate' && zone.cancelRate > 50 ? 'text-red-600' : metric === 'revenue' ? 'text-blue-700' : 'text-slate-900'}`}>{mainVal}</p>
      </div>
    </div>
  );
}

export default function ZoneList({ title, Icon, zones, metric, nameMap, iconColor }) {
  if (!zones?.length) return null;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className={iconColor} />
        <p className="text-sm font-bold text-slate-700">{title}</p>
        <span className="text-[10px] text-slate-400 ml-auto">{zones.length} zones</span>
      </div>
      <div className="space-y-1.5">
        {zones.slice(0, 8).map((z, i) => (
          <ZoneCard key={`${z.lat},${z.lng}`} zone={z} rank={i} metric={metric} nameMap={nameMap} />
        ))}
      </div>
    </Card>
  );
}
