import { useState } from 'react';
import { TrendingUp } from 'lucide-react';

function fmtR(rupees) {
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000)   return `₹${(rupees / 1000).toFixed(1)}K`;
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
}

export default function RevenueTrend({ data = [] }) {
  const [metric, setMetric] = useState('revenue');
  const noData = !data.length || data.every(d => !d.revenueRupees && !d.orders);
  if (noData) return (
    <div className="h-32 flex flex-col items-center justify-center gap-1 text-slate-400">
      <TrendingUp size={28} strokeWidth={1} />
      <p className="text-xs font-semibold">No order data yet for this period</p>
    </div>
  );
  const vals = data.map(d => metric === 'revenue' ? d.revenueRupees : metric === 'orders' ? d.orders : d.completed);
  const max  = Math.max(...vals, 1);
  const W = 600; const H = 90;
  const pts  = vals.map((v, i) => `${(i / Math.max(vals.length - 1, 1)) * W},${H - ((v / max) * (H - 10)) - 4}`).join(' ');
  const col  = { revenue: '#2563eb', orders: '#f97316', completed: '#10b981' }[metric];
  const total = vals.reduce((s, v) => s + v, 0);
  const avg   = Math.round(total / vals.length);
  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {[['revenue','Revenue','#2563eb'],['orders','Orders','#f97316'],['completed','Done','#10b981']].map(([id, lbl, c]) => (
          <button key={id} onClick={() => setMetric(id)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border ${metric===id ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            style={metric===id ? { backgroundColor: c } : {}}>
            {lbl}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-slate-400 self-center">
          Avg/day: {metric === 'revenue' ? fmtR(avg) : avg}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 96 }}>
        <defs>
          <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.2" />
            <stop offset="100%" stopColor={col} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#grad-${metric})`} />
        <polyline fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-slate-400">
        {data.filter((_, i) => i === 0 || i === Math.floor(data.length / 2) || i === data.length - 1).map(d => (
          <span key={d.date}>{d.date?.slice(5)}</span>
        ))}
      </div>
    </div>
  );
}
