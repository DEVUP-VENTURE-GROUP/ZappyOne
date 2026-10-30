import { AlertTriangle, Wallet } from 'lucide-react';
import { useShopDuesQuery } from '../../services/api';
import { formatPaise } from '../../utils/money';

// Commission this business owes ZappyOne from cash jobs; hidden when nothing is owed (server shop/shop-dues).
export default function PartnerDuesCard() {
  const { data } = useShopDuesQuery(undefined, { pollingInterval: 120000 });
  if (!data || data.duesPaise <= 0) return null;
  const stopped = data.isBlocked;
  const near = !stopped && data.duesPaise >= data.warnPaise;
  return (
    <section className={`rounded-2xl border p-4 ${stopped ? 'border-red-200 bg-red-50/70' : near ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2">
        {stopped ? <AlertTriangle size={18} className="text-red-600" /> : <Wallet size={18} className="text-slate-600" />}
        <h2 className="text-[15px] font-bold text-slate-900">You owe ZappyOne {formatPaise(data.duesPaise)}</h2>
      </div>
      <p className="mt-1 text-[13px] text-slate-600">
        {stopped
          ? `New jobs are paused until it is under ${formatPaise(data.limitPaise)}.`
          : `Commission from cash jobs. New jobs pause at ${formatPaise(data.limitPaise)}.`}
        {' '}Online jobs pay it down by themselves.
      </p>
      {data.payInstructions && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[12.5px] font-semibold text-slate-700">{data.payInstructions}</p>}
    </section>
  );
}
