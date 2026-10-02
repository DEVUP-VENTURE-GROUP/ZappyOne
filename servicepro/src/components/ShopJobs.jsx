import { useNavigate } from 'react-router-dom';
import {
  Wrench, PawPrint, ChevronRight, Loader2, Clock, Banknote, UserX,
} from 'lucide-react';
import { useProviderJobs } from '@shared/provider/useProviderJobs';
import AssignTechnician from '@shared/provider/components/AssignTechnician';
import { formatPaise } from '@shared/utils/money';

/**
 * The shop's open work — every kind it takes — and who is doing each job.
 *
 * The shop holds the booking, but somebody has to go: every job carries the
 * technician it is on and a way to change it. A job nobody is on yet is
 * flagged, because it cannot set off until someone is named.
 */

const KIND_ICON = { repair: Wrench, pet: PawPrint };

export default function ShopJobs({ kinds = ['repair', 'pet'] }) {
  const nav = useNavigate();
  const { mine: jobs, isLoading, refetch } = useProviderJobs({ kinds });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-zappy-400" /></div>;
  }

  if (!jobs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center">
        <Wrench size={20} className="mx-auto text-slate-300" />
        <p className="mt-2 text-sm font-bold text-slate-700">No open jobs</p>
        <p className="mt-0.5 text-xs text-slate-500">Jobs appear here, and ring, the moment a customer books your shop.</p>
      </div>
    );
  }

  // How many open jobs each technician already holds, so work goes to whoever is free.
  const busy = {};
  for (const j of jobs) if (j.workerId) busy[j.workerId] = (busy[j.workerId] || 0) + 1;

  return (
    <div className="space-y-2">
      {jobs.map((j) => {
        const Icon = KIND_ICON[j.kind] || Wrench;
        return (
          <div key={`${j.kind}:${j.id}`} className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <button type="button" onClick={() => nav(j.to)} className="flex w-full items-start gap-3 text-left">
              <Icon size={16} className="mt-0.5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold capitalize text-[#0F172A]">{j.title}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    j.attention ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {j.status}
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {j.valuePaise > 0 && <span className="text-[11px] font-semibold text-[#0F172A]">{formatPaise(j.valuePaise)}</span>}
                  {j.cashDue && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><Banknote size={10} /> collect cash</span>
                  )}
                  {j.late && <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><Clock size={10} /> running late</span>}
                  {!j.workerId && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700"><UserX size={10} /> nobody on it</span>
                  )}
                </span>
              </span>
              <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-300" />
            </button>

            <AssignTechnician jobId={j.id} workerId={j.workerId} busy={busy} onDone={refetch} />
          </div>
        );
      })}
    </div>
  );
}
