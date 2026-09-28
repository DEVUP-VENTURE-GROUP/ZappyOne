import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, IndianRupee, Briefcase, Users, Loader2 } from 'lucide-react';
import { useShopEarningsQuery } from '@shared/services/api';

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

export default function ShopEarningsPage() {
  const nav = useNavigate();
  const [range, setRange] = useState('today');
  const { data, isLoading } = useShopEarningsQuery(range);

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => nav('/shop')} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card">Earnings</h1>
      </div></header>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-4 space-y-3">

        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${range === r.key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
              {r.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
        ) : (
          <>
            <div className="card bg-gradient-to-br from-indigo-600 to-indigo-700 text-white">
              <p className="text-xs font-semibold text-indigo-100 uppercase tracking-wide">Total Earnings</p>
              <p className="text-4xl font-black mt-1 flex items-center gap-0.5">
                <IndianRupee size={26} strokeWidth={2.5} />{data?.earningsRupees ?? 0}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card flex flex-col items-start gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center"><Briefcase size={16} className="text-emerald-600" /></div>
                <p className="text-2xl font-black text-[#0F172A]">{data?.jobs ?? 0}</p>
                <p className="text-xs text-slate-400 font-semibold">Jobs completed</p>
              </div>
              <div className="card flex flex-col items-start gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center"><Users size={16} className="text-indigo-600" /></div>
                <p className="text-2xl font-black text-[#0F172A]">{data?.workerCount ?? 0}</p>
                <p className="text-xs text-slate-400 font-semibold">Workers under shop</p>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center pt-2">
              Earnings across all workers linked to your shop, on the same commission model as Zappy Express.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
