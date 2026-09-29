function fmtR(rupees) {
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000)   return `₹${(rupees / 1000).toFixed(1)}K`;
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
}

export default function LeakagePanel({ d }) {
  const lost     = (d.cancelledOrders || 0) * (d.avgFareRupees || 0);
  const earned   = d.totalRevRupees || 0;
  const lossRate = earned + lost > 0 ? Math.round((lost / (earned + lost)) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-red-50 border border-red-100">
        <p className="text-xs font-bold text-red-700">Revenue Lost to Cancels</p>
        <p className="text-2xl font-extrabold text-red-600 mt-0.5">{fmtR(lost)}</p>
        <p className="text-[10px] text-red-500 mt-0.5">{d.cancelledOrders || 0} orders × {fmtR(d.avgFareRupees || 0)} avg</p>
        <div className="bg-white/60 rounded-full h-1.5 mt-2 overflow-hidden">
          <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${lossRate}%` }} />
        </div>
        <p className="text-[10px] text-red-500 mt-0.5">{lossRate}% of potential revenue lost</p>
      </div>
      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
        <p className="text-xs font-bold text-emerald-700">Captured Revenue</p>
        <p className="text-2xl font-extrabold text-emerald-600 mt-0.5">{fmtR(earned)}</p>
        <p className="text-[10px] text-emerald-500 mt-0.5">{d.completedOrders || 0} completed orders</p>
      </div>
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
        <p className="text-xs font-bold text-slate-600">Revenue/User</p>
        <p className="text-xl font-extrabold text-slate-700 mt-0.5">
          {d.uniqueActiveUsers ? fmtR(Math.round(earned / d.uniqueActiveUsers)) : '—'}
        </p>
        <p className="text-[10px] text-slate-400">{(d.uniqueActiveUsers || 0)} active users</p>
      </div>
    </div>
  );
}
