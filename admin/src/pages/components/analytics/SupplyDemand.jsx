export default function SupplyDemand({ hourly = [], onlineWorkers = 2 }) {
  const all24 = Array.from({ length: 24 }, (_, h) => {
    const f = hourly.find(d => d.hour === h);
    return { hour: h, orders: f?.orders || 0 };
  });
  const maxOrders = Math.max(...all24.map(d => d.orders), 1);
  const capacity  = onlineWorkers * 2;
  return (
    <div>
      <div className="flex items-end gap-0.5" style={{ height: 80 }}>
        {all24.map(d => {
          const pct    = (d.orders / maxOrders) * 100;
          const gapped = capacity > 0 && d.orders > capacity;
          return (
            <div key={d.hour} className="flex-1 group relative flex flex-col justify-end" style={{ height: '100%' }}>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 pointer-events-none">
                <div className="bg-slate-900 text-white text-[9px] px-1.5 py-1 rounded shadow-lg whitespace-nowrap">
                  {d.hour}:00 — {d.orders} orders{gapped ? ' · supply gap' : ''}
                </div>
              </div>
              <div
                style={{ height: `${Math.max(pct, 2)}%`, backgroundColor: gapped ? '#ef4444' : '#6366f1', opacity: 0.8 }}
                className="w-full rounded-sm transition-all"
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-[9px] text-slate-400">
        {['12am','6am','12pm','6pm','11pm'].map(l => <span key={l}>{l}</span>)}
      </div>
      <div className="flex gap-3 mt-2 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" />Normal</span>
        <span className="flex items-center gap-1 text-[10px] text-red-500 font-semibold"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />Supply gap</span>
      </div>
    </div>
  );
}
