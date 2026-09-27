const DOW_LABELS = ['', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SERVICE_COLORS = {
  puncture: '#ef4444', plumbing: '#3b82f6', electrical: '#eab308',
  helper: '#6b7280', carpenter: '#f59e0b', ac_repair: '#06b6d4',
  cleaning: '#22c55e', painting: '#a855f7',
};

export function HourlyChart({ data = [] }) {
  const all24  = Array.from({ length: 24 }, (_, h) => ({ value: data.find(d => d.hour === h)?.orders || 0, hour: h }));
  const max    = Math.max(...all24.map(d => d.value), 1);
  const peakH  = all24.reduce((m, d) => d.value > (m?.value || 0) ? d : m, null);
  const NIGHT  = new Set([0,1,2,3,4,5,22,23]);
  const MORN   = new Set([6,7,8,9,10,11]);
  return (
    <div>
      <div className="flex items-end gap-px" style={{ height: 72 }}>
        {all24.map(d => {
          const isPeak = d.hour === peakH?.hour;
          const col    = isPeak ? '#f97316' : NIGHT.has(d.hour) ? '#475569' : MORN.has(d.hour) ? '#6366f1' : '#3b82f6';
          return (
            <div key={d.hour} className="flex-1 flex flex-col justify-end group relative" style={{ height: '100%' }}>
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 shadow-lg">{d.hour}:00–{d.hour+1}:00<br/>{d.value} orders</div>
              <div className="w-full rounded-sm transition-all" style={{ height: `${Math.max((d.value / max) * 100, 2)}%`, backgroundColor: col, opacity: 0.85 }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5">{['12am','6am','12pm','6pm','11pm'].map(l => <span key={l} className="text-[9px] text-slate-400">{l}</span>)}</div>
      <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-orange-500" /> Peak hour</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-indigo-500" /> Morning</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-slate-500" /> Night</span>
      </div>
      {peakH && <p className="text-xs text-orange-600 font-bold mt-1.5">Peak: {peakH.hour}:00 ({peakH.value} orders)</p>}
    </div>
  );
}

export function DowChart({ data = [] }) {
  const all7 = Array.from({ length: 7 }, (_, i) => { const d = data.find(d => d.dow === i + 1); return { label: DOW_LABELS[i + 1], value: d?.orders || 0, dow: i + 1 }; });
  const max  = Math.max(...all7.map(d => d.value), 1);
  const peak = all7.reduce((m, d) => d.value > (m?.value || 0) ? d : m, null);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 64 }}>
        {all7.map(d => <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-0.5"><div className="w-full rounded-sm transition-all" style={{ height: `${Math.max((d.value / max) * 100, 2)}%`, backgroundColor: d.dow === peak?.dow ? '#f97316' : '#8b5cf6', opacity: 0.8 }} /></div>)}
      </div>
      <div className="flex justify-between mt-1.5">{all7.map(d => <span key={d.label} className={`flex-1 text-center text-[10px] font-semibold ${d.dow === peak?.dow ? 'text-orange-500' : 'text-slate-400'}`}>{d.label}</span>)}</div>
      {peak && <p className="text-xs text-orange-600 font-bold mt-1.5">Busiest: {peak.label} ({peak.value} orders)</p>}
    </div>
  );
}

export function ServiceBreakdown({ data = [] }) {
  const total = data.reduce((s, d) => s + d.total, 0) || 1;
  return (
    <div className="space-y-2.5">
      {data.map(s => {
        const pct       = Math.round((s.total / total) * 100);
        const cancelPct = s.total > 0 ? Math.round((s.cancelled / s.total) * 100) : 0;
        const col       = SERVICE_COLORS[s.service] || '#94a3b8';
        return (
          <div key={s.service}>
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col }} /><span className="text-xs font-semibold text-slate-700 capitalize">{s.service?.replace(/_/g,' ')}</span></div>
              <div className="flex items-center gap-3 text-xs"><span className="text-slate-400">{s.total} orders</span><span className="font-bold text-slate-800">₹{s.revenue?.toLocaleString('en-IN')}</span><span className="text-slate-400">avg ₹{s.avgFare}</span></div>
            </div>
            <div className="flex bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div className="h-2.5 transition-all" style={{ width: `${s.completionRate}%`, backgroundColor: col, opacity: 0.8 }} />
              <div className="h-2.5 bg-red-400 transition-all" style={{ width: `${cancelPct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] mt-0.5">
              <span className="text-slate-400">{pct}% of orders</span>
              <span className={cancelPct > 30 ? 'text-red-500 font-semibold' : 'text-slate-400'}>{cancelPct}% cancel</span>
            </div>
          </div>
        );
      })}
      <div className="flex gap-4 pt-2 border-t border-slate-50 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-1.5 inline-block rounded-sm bg-blue-500 opacity-80" /> Completed</span>
        <span className="flex items-center gap-1"><span className="w-2 h-1.5 inline-block rounded-sm bg-red-400" /> Cancelled</span>
      </div>
    </div>
  );
}
