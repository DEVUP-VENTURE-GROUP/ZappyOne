import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench, ChevronRight, Loader2, UserPlus, Check, Clock, Banknote,
} from 'lucide-react';
import {
  useRepairProviderJobsQuery,
  useShopWorkersQuery,
  useAssignRepairWorkerMutation,
} from '@shared/services/api';
import toast from 'react-hot-toast';
import { formatPaise } from '@shared/utils/money';

/**
 * The shop's repair work, and who is doing it.
 *
 * A shop had no repair jobs list at all — work could be assigned to a shop and
 * the owner would never see it, because the only jobs panel lived on the
 * technician's dashboard. This is that panel from the owner's side: the shop
 * holds the booking, but somebody has to hold the screwdriver, so every job
 * carries the technician it is on and a way to change it.
 */

const rupees = formatPaise;

const STATUS_TONE = {
  PROVIDER_ASSIGNED: { label: 'Needs accepting', tone: 'bg-amber-50 text-amber-700' },
  WORKER_ACCEPTED: { label: 'Accepted', tone: 'bg-blue-50 text-blue-700' },
  ON_THE_WAY: { label: 'On the way', tone: 'bg-blue-50 text-blue-700' },
  ARRIVED: { label: 'At the customer', tone: 'bg-blue-50 text-blue-700' },
  DIAGNOSING: { label: 'Diagnosing', tone: 'bg-indigo-50 text-indigo-700' },
  QUOTE_PENDING: { label: 'Quote sent', tone: 'bg-amber-50 text-amber-700' },
  CUSTOMER_APPROVAL_PENDING: { label: 'Waiting on customer', tone: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Approved — start work', tone: 'bg-emerald-50 text-emerald-700' },
  REPAIR_IN_PROGRESS: { label: 'Being repaired', tone: 'bg-indigo-50 text-indigo-700' },
  AT_WORKSHOP: { label: 'At the workshop', tone: 'bg-indigo-50 text-indigo-700' },
  QA_PENDING: { label: 'Quality check', tone: 'bg-amber-50 text-amber-700' },
  READY_FOR_RETURN: { label: 'Ready to return', tone: 'bg-emerald-50 text-emerald-700' },
  OUT_FOR_RETURN: { label: 'Out for return', tone: 'bg-blue-50 text-blue-700' },
  COMPLETED: { label: 'Done', tone: 'bg-slate-100 text-slate-600' },
};

/** Pick which of the shop's own technicians takes this one. */
function AssignRow({ booking, workers, onDone }) {
  const [assign, { isLoading }] = useAssignRepairWorkerMutation();
  const [open, setOpen] = useState(false);

  const current = workers.find((w) => String(w._id) === String(booking.workerId));

  async function give(workerId) {
    try {
      await assign({ id: booking._id, workerId }).unwrap();
      toast.success('Assigned — they have been notified');
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not assign that technician');
    }
  }

  if (!workers.length) {
    return (
      <p className="mt-2 text-[11px] text-slate-400">
        Add technicians to your team to hand jobs to them.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11.5px] font-bold text-indigo-600"
      >
        <UserPlus size={12} />
        {current ? `On ${current.name}` : 'Assign a technician'}
      </button>

      {open && (
        <div className="mt-1.5 space-y-1">
          {workers.map((w) => {
            const isCurrent = String(w._id) === String(booking.workerId);
            return (
              <button
                key={w._id}
                onClick={() => give(w._id)}
                disabled={isLoading || isCurrent}
                className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition ${
                  isCurrent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:border-indigo-200'
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{w.name}</span>
                {isCurrent
                  ? <Check size={12} className="shrink-0 text-emerald-600" />
                  : isLoading && <Loader2 size={12} className="shrink-0 animate-spin text-slate-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ShopRepairJobs() {
  const nav = useNavigate();
  const { data, isLoading, refetch } = useRepairProviderJobsQuery({});
  const { data: teamData } = useShopWorkersQuery();

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-indigo-400" /></div>;
  }

  const jobs = data?.jobs || data?.bookings || [];
  const workers = teamData?.workers || [];

  if (!jobs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center">
        <Wrench size={20} className="mx-auto text-slate-300" />
        <p className="mt-2 text-sm font-bold text-slate-700">No repair jobs yet</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Jobs appear here the moment a customer books your shop.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.map((b) => {
        const meta = STATUS_TONE[b.status] || { label: b.status, tone: 'bg-slate-100 text-slate-600' };
        return (
          <div key={b._id} className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <button onClick={() => nav(`/worker/repair/${b._id}`)} className="flex w-full items-start gap-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-[#0F172A]">
                    {[b.brandCode, b.modelCode].filter(Boolean).join(' ') || b.reference}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.tone}`}>
                    {meta.label}
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="text-[11px] font-semibold text-[#0F172A]">
                    {rupees(b.priceSnapshot?.totalPaise)}
                  </span>
                  {b.paymentMethod === 'cash' && b.paymentStatus !== 'paid' && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <Banknote size={10} /> collect cash
                    </span>
                  )}
                  {b.stageDeadlineAt && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock size={10} />
                      {new Date(b.stageDeadlineAt) < new Date() ? 'running late' : 'on time'}
                    </span>
                  )}
                </span>
              </span>
              <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-300" />
            </button>

            <AssignRow booking={b} workers={workers} onDone={refetch} />
          </div>
        );
      })}
    </div>
  );
}
