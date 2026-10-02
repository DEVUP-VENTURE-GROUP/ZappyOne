import { useState } from 'react';
import { Check, Loader2, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useShopWorkersQuery, useAssignJobTechnicianMutation } from '../../services/api';

/**
 * Pick which of the shop's own technicians does this job — any kind of job.
 *
 * Online technicians come first, and each shows how many open jobs they
 * already hold, so the owner hands work to whoever is actually free.
 *
 *   jobId     the job (repair, pet care…)
 *   workerId  who is on it now, if anyone
 *   busy      optional { [workerId]: open job count }
 *   onDone    called after a successful assignment
 */
export default function AssignTechnician({ jobId, workerId, busy = {}, onDone, startOpen = false }) {
  const { data } = useShopWorkersQuery();
  const [assign, { isLoading }] = useAssignJobTechnicianMutation();
  const [open, setOpen] = useState(startOpen);

  const workers = [...(data?.workers || [])]
    .filter((w) => !w.isBlocked)
    .sort((a, b) => Number(!!b.isOnline) - Number(!!a.isOnline) || (busy[a._id] || 0) - (busy[b._id] || 0));
  const current = workers.find((w) => String(w._id) === String(workerId));

  async function give(id) {
    try {
      const res = await assign({ id: jobId, workerId: id }).unwrap();
      toast.success(`${res.workerName || 'Technician'} has the job — they have been told`);
      setOpen(false);
      onDone?.();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not assign that technician');
    }
  }

  if (!data) return null;
  if (!workers.length) {
    return <p className="mt-2 text-[11px] text-slate-400">Add technicians to your team to hand jobs to them.</p>;
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[11.5px] font-bold text-zappy-600">
        <UserPlus size={12} />
        {current ? `On ${current.name} · change` : 'Assign a technician'}
      </button>

      {open && (
        <div className="mt-1.5 space-y-1">
          {workers.map((w) => {
            const isCurrent = String(w._id) === String(workerId);
            const load = busy[w._id] || 0;
            return (
              <button
                key={w._id}
                type="button"
                onClick={() => give(w._id)}
                disabled={isLoading || isCurrent}
                className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition ${
                  isCurrent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:border-zappy-200'
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${w.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{w.name}</span>
                <span className="shrink-0 text-[10.5px] text-slate-400">
                  {w.isOnline ? 'online' : 'offline'}{load ? ` · ${load} job${load === 1 ? '' : 's'}` : ''}
                </span>
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
