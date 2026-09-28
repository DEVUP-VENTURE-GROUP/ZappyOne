import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin, Package, Banknote, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAvailableHelpingTasksQuery, useAcceptHelpingTaskMutation, useAssignedHelpingTasksQuery } from '../../services/api';
import ActiveJobs from '../../components/worker/ActiveJobs';

const STATUS_LABEL = {
  WORKER_ASSIGNED: 'Assigned', WORKER_ACCEPTED: 'Accepted', EN_ROUTE: 'On the way', ARRIVED: 'Arrived',
  TASK_STARTED: 'Started', IN_PROGRESS: 'In progress', APPROVAL_REQUIRED: 'Waiting on customer',
  RETURNING: 'Returning', AT_DROPOFF: 'At drop-off', HANDED_OVER: 'Handed over',
};
import { formatPaise } from '../../utils/money';

/**
 * Worker task list (§10, §55).
 *
 * The earning is shown BEFORE accepting — a helper decides whether a trip is
 * worth it from this number, not by finding out afterwards. The item budget
 * is a second, clearly separate figure: a task needing a helper to front
 * ₹800 is a different decision than one that doesn't, even at the same fee.
 */
export default function WorkerHelpingTasksPage() {
  const nav = useNavigate();
  const { data, isLoading, refetch } = useAvailableHelpingTasksQuery(undefined, { pollingInterval: 20000 });
  const [accept, { isLoading: accepting }] = useAcceptHelpingTaskMutation();
  const { data: mine } = useAssignedHelpingTasksQuery(undefined, { pollingInterval: 20000 });
  const myJobs = (mine?.tasks || []).map((t) => ({
    id: t._id,
    to: `/worker/helping/${t._id}`,
    title: t.title || t.reference,
    subtitle: t.pickupLocation?.address || '',
    status: STATUS_LABEL[t.status] || t.status,
    attention: t.status === 'APPROVAL_REQUIRED',
  }));

  async function take(id) {
    try {
      await accept(id).unwrap();
      toast.success('Task accepted');
      nav(`/worker/helping/${id}`);
    } catch (err) {
      if (err?.data?.code === 'ALREADY_CLAIMED') {
        toast.error('Someone else got there first');
        refetch();
      } else {
        toast.error(err?.data?.error || 'Could not accept this task');
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">Available Errands</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-2.5">
        <ActiveJobs items={myJobs} />
        {isLoading && <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>}

        {!isLoading && !(data?.tasks || []).length && (
          <p className="text-center text-sm text-slate-400 py-16">Nothing nearby right now.</p>
        )}

        {(data?.tasks || []).map((t) => (
          <div key={t._id} className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2.5">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-500">
                  {t.serviceType} {t.itemCount ? `· ${t.itemCount} item${t.itemCount > 1 ? 's' : ''}` : ''}
                </p>
                <p className="font-bold text-[#0F172A] mt-0.5 truncate">{t.pickupAddress}</p>
                {t.destinationAddress && (
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <MapPin size={11} /> {t.destinationAddress}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-lg font-black text-emerald-600">{formatPaise(t.earningPaise)}</p>
                <p className="text-[10px] text-slate-400">{t.distanceKm ? `${t.distanceKm} km` : ''}</p>
              </div>
            </div>

            {t.itemBudgetPaise > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5">
                <Package size={12} /> Shopping budget: {formatPaise(t.itemBudgetPaise)}
                {t.advanceRequired && (
                  <span className="flex items-center gap-1 text-amber-600 font-bold ml-auto">
                    <Banknote size={12} /> You front this
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => take(t._id)}
              disabled={accepting}
              className="w-full rounded-xl bg-[#0F172A] text-white font-bold py-2.5 disabled:opacity-50"
            >
              Accept
            </button>
          </div>
        ))}

        <div className="flex items-start gap-2 text-[11px] text-slate-400 px-1 pt-2">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>Buy or carry only what's on the task. Never spend above the approved price without asking.</span>
        </div>
      </div>
    </div>
  );
}
