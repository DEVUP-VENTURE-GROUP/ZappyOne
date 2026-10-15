import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useRepairGroupQuery } from '@shared/services/api';
import { KINDS } from '@shared/customer/jobKinds';
import { STAGE_LABEL } from '@shared/customer/repairBasket';
import { formatPaise } from '@shared/utils/money';
import { useSafeBack } from '../../../hooks/useBookingFlow';

const deviceName = (b) => [b.brandCode, b.modelCode].filter(Boolean).join(' ').replace(/-/g, ' ');

/**
 * A visit with several vehicles or devices: where each one stands, and the
 * way into its own page (tracking, quote, report, warranty).
 */
export default function RepairGroupPage() {
  const { id } = useParams();
  const back = useSafeBack('/orders');
  const { data, isLoading } = useRepairGroupQuery(id, { pollingInterval: 30000 });
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>;
  if (!data?.group) return <div className="mx-auto max-w-lg p-6 text-center text-slate-500">This visit could not be found.</div>;
  const { group, bookings } = data;
  const done = bookings.filter((b) => KINDS.repair.stageOf(b.status) === 'completed').length;
  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 py-4">
      <button type="button" onClick={() => back()} className="text-sm font-semibold text-slate-500">← Back</button>
      <div className="card">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">One visit, {group.reference}</p>
        <p className="mt-1 text-lg font-black text-[#0F172A]">{bookings.length} items, {done} done</p>
        <p className="text-[12.5px] text-slate-500">{group.location?.address}</p>
        <p className="mt-1 text-[13px] font-bold">{formatPaise(group.totals?.totalPaise)} total</p>
      </div>
      {bookings.map((b) => {
        const stage = KINDS.repair.stageOf(b.status) || 'in_progress';
        return (
          <Link key={b._id} to={`/repair/bookings/${b._id}`} className="card flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold capitalize text-[#0F172A]">{b.itemLabel || deviceName(b)}</span>
              <span className="block text-[12px] text-slate-500">{STAGE_LABEL[stage] || 'In progress'}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </Link>
        );
      })}
    </div>
  );
}
