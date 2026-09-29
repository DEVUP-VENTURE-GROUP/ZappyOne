import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Package, Tag, ShoppingBag } from 'lucide-react';
import { useGetSpendingQuery } from '@shared/services/api';
import { serviceLabel } from '@shared/constants/services';

function Bar({ value, max, color = 'bg-zappy-500' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SpendingPage() {
  const nav = useNavigate();
  const { data, isLoading } = useGetSpendingQuery();

  const months = data?.monthly ?? [];
  const topServices = data?.topServices ?? [];
  const maxMonthly = months.length ? Math.max(...months.map(m => m.totalRupees)) : 1;
  const maxService = topServices.length ? Math.max(...topServices.map(s => s.totalRupees)) : 1;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => nav(-1)} className="p-1.5 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-slate-800">Spending Analytics</h1>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center h-60">
          <div className="w-7 h-7 rounded-full border-2 border-zappy-200 border-t-zappy-600 animate-spin" />
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3 shadow-sm text-center">
              <ShoppingBag className="w-5 h-5 text-zappy-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-800">₹{(data?.totalSpentRupees ?? 0).toLocaleString('en-IN')}</p>
              <p className="text-xs text-slate-500">Total spent</p>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center">
              <Package className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-800">{data?.orderCount ?? 0}</p>
              <p className="text-xs text-slate-500">Orders</p>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center">
              <Tag className="w-5 h-5 text-rose-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-800">₹{Math.round((data?.totalSavingsPaise ?? 0) / 100).toLocaleString('en-IN')}</p>
              <p className="text-xs text-slate-500">Saved</p>
            </div>
          </div>

          {/* Monthly breakdown */}
          {months.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-zappy-500" />
                <h2 className="font-semibold text-slate-700 text-sm">Monthly Spending (last 6 months)</h2>
              </div>
              <div className="space-y-3">
                {months.slice(-6).map(m => (
                  <div key={m.month}>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>{new Date(`${m.month}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}</span>
                      <span className="font-medium text-slate-700">₹{m.totalRupees.toLocaleString('en-IN')}</span>
                    </div>
                    <Bar value={m.totalRupees} max={maxMonthly} color="bg-zappy-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top services */}
          {topServices.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-3">Top Services</h2>
              <div className="space-y-3">
                {topServices.map((s, i) => (
                  <div key={s.service}>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span className="flex items-center gap-1">
                        <span className="text-slate-300 font-mono">#{i + 1}</span>
                        {serviceLabel(s.service)}
                      </span>
                      <span className="font-medium text-slate-700">₹{s.totalRupees.toLocaleString('en-IN')}</span>
                    </div>
                    <Bar value={s.totalRupees} max={maxService} color="bg-emerald-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {months.length === 0 && topServices.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No spending data yet</p>
              <p className="text-xs mt-1">Complete your first order to see analytics</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
