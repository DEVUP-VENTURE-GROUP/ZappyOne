import toast from 'react-hot-toast';
import { Zap } from 'lucide-react';
import { useAutoAcceptQuery, useSaveAutoAcceptMutation } from '../../services/api';
import { autoAcceptStatus, autoAcceptRule, AUTO_ACCEPT_KM } from './autoAccept';

/**
 * Auto-accept: jobs nearby become the provider's with no tap (server
 * jobs/fast-assign). `who` is 'workers' or 'shops'. Hidden when the platform
 * has it off or the worker is a shop's technician.
 */
export default function AutoAcceptCard({ who = 'workers' }) {
  const { data } = useAutoAcceptQuery(who);
  const [save, { isLoading }] = useSaveAutoAcceptMutation();
  if (!data?.available) return null;
  const a = data.autoAccept;

  async function change(body) {
    try { await save({ who, ...body }).unwrap(); } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <label className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Zap size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">Auto-accept jobs</span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate-500">{autoAcceptStatus(data)}</span>
        </span>
        <input type="checkbox" checked={a.enabled} disabled={isLoading || !!a.pausedUntil} onChange={(e) => change({ enabled: e.target.checked })}
          className="mt-1 h-5 w-5" aria-label="Auto-accept jobs" />
      </label>
      {a.enabled && !a.pausedUntil && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-semibold text-slate-500">Only within</span>
          {AUTO_ACCEPT_KM.filter((km) => km == null || km < data.radiusKm).map((km) => (
            <button key={String(km)} type="button" disabled={isLoading} onClick={() => change({ maxKm: km })}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold ${(a.maxKm ?? null) === km ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {km == null ? `${data.radiusKm} km` : `${km} km`}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-slate-400">{autoAcceptRule(data)}</p>
    </section>
  );
}
