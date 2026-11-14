import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, IndianRupee, Briefcase, Users, Loader2 } from 'lucide-react';
import { useShopEarningsQuery, useShopStatementQuery } from '@shared/services/api';
import { useI18n } from '@shared/i18n/I18nProvider';

const RANGES = [
  { key: 'today', label: 'Today', tk: 'sp.today' },
  { key: 'week', label: 'This Week', tk: 'sp.week' },
  { key: 'month', label: 'This Month', tk: 'sp.month' },
];

export default function ShopEarningsPage() {
  const nav = useNavigate();
  const { t, lang } = useI18n();
  const [range, setRange] = useState('today');
  const { data, isLoading } = useShopEarningsQuery(range);
  const [month, setMonth] = useState('');
  const { data: statement } = useShopStatementQuery(month || undefined);
  const monthName = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(`${lang}-IN`, { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => nav('/shop')} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card">{t('sp.earnings', 'Earnings')}</h1>
      </div></header>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-4 space-y-3">

        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${range === r.key ? 'bg-zappy-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
              {t(r.tk, r.label)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>
        ) : (
          <>
            <div className="card bg-zappy-600 text-white">
              <p className="text-xs font-semibold text-zappy-100 uppercase tracking-wide">{t('sp.totalEarnings', 'Total Earnings')}</p>
              <p className="text-4xl font-black mt-1 flex items-center gap-0.5">
                <IndianRupee size={26} strokeWidth={2.5} />{data?.earningsRupees ?? 0}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card flex flex-col items-start gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center"><Briefcase size={16} className="text-emerald-600" /></div>
                <p className="text-2xl font-black text-[#0F172A]">{data?.jobs ?? 0}</p>
                <p className="text-xs text-slate-400 font-semibold">{t('sp.jobsDone', 'Jobs completed')}</p>
              </div>
              <div className="card flex flex-col items-start gap-2">
                <div className="w-9 h-9 rounded-xl bg-zappy-50 flex items-center justify-center"><Users size={16} className="text-zappy-600" /></div>
                <p className="text-2xl font-black text-[#0F172A]">{data?.workerCount ?? 0}</p>
                <p className="text-xs text-slate-400 font-semibold">{t('sp.workers', 'Workers under shop')}</p>
              </div>
            </div>

            {statement && (
              <div className="card">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-[#0F172A]">{t('sp.statement', 'Monthly statement')}</p>
                  <select value={statement.month} onChange={(e) => setMonth(e.target.value)} aria-label={t('sp.statement', 'Monthly statement')}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700">
                    {statement.months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
                  </select>
                </div>
                <div className="mt-3 flex justify-between text-sm">
                  <span className="text-slate-500">{t('sp.jobsDone', 'Jobs completed')}</span><span className="font-bold">{statement.jobs}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-slate-500">{t('sp.earned', 'Earned')}</span><span className="font-bold">₹{Math.round(statement.earningsPaise / 100)}</span>
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-400 text-center pt-2">
              {t('sp.er.note', 'Earnings across all workers linked to your shop, on the same commission model as Zappy Express.')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
