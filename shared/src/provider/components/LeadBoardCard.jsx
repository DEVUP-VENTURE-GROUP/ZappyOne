import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Crown } from 'lucide-react';
import { useTeamBoardQuery, useAssignJobTechnicianMutation } from '../../services/api';
import { leadView } from '../partnerBoard';

/**
 * A partner's team lead: jobs nobody is on yet, given to someone in the group
 * in one tap, and who in the group is on what (server shop/partner.service).
 */
export default function LeadBoardCard() {
  const { data } = useTeamBoardQuery(undefined, { pollingInterval: 30000 });
  const [assign, { isLoading }] = useAssignJobTechnicianMutation();
  if (!data) return null;
  const { waiting, people } = leadView(data);
  const give = (jobId, workerId) => workerId && assign({ id: jobId, workerId }).unwrap()
    .then((r) => toast.success(`${r.workerName || 'They'} have the job`))
    .catch((e) => toast.error(e?.data?.error || 'Could not give the job'));

  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-4">
      <p className="flex items-center gap-1.5 text-[14px] font-bold text-slate-900"><Crown size={14} className="text-amber-600" /> Your group</p>
      {waiting.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[12px] font-bold text-slate-500">Waiting for someone ({waiting.length})</p>
          {waiting.map((j) => (
            <div key={j.id} className="flex items-center gap-2 rounded-xl bg-amber-50 p-2.5">
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-slate-900">{j.title}</span><span className="block truncate text-[11.5px] text-slate-500">{j.where}</span></span>
              <select defaultValue="" disabled={isLoading} onChange={(e) => give(j.id, e.target.value)} aria-label="Give to"
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px]">
                <option value="" disabled>Give to</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.lead ? 'Me' : p.name}{p.isOnline ? '' : ' (off duty)'}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      <ul className="mt-3 divide-y divide-slate-100">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-2 text-[13px]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${p.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{p.lead ? `${p.name} (you)` : p.name}</span>
            <span className="shrink-0 text-[12px] text-slate-500">
              {p.jobs.length ? p.jobs.map((j) => <Link key={j.id} to={`/worker/${j.kind}/${j.id}`} className="ml-2 font-semibold text-zappy-700">{j.title}</Link>) : 'Free'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
