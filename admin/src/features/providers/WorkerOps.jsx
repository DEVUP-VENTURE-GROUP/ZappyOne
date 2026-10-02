import { useSearchParams } from 'react-router-dom';
import { Loader2, ShieldCheck, Users, UserCheck, Ban, AlertTriangle, Smartphone, ArrowRight } from 'lucide-react';
import { useAdminWorkerOpsQuery } from '@shared/services/api';

function Stat({ icon: Icon, label, value, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900', green: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600', indigo: 'text-zappy-600',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 truncate">
        <Icon size={13} className="shrink-0" /> <span className="truncate">{label}</span>
      </div>
      <p className={`text-2xl font-black mt-1 ${tones[tone]}`}>{Number(value ?? 0).toLocaleString('en-IN')}</p>
    </div>
  );
}

/**
 * Live view of the Rakshak workforce: who is online, who is cancelling, who
 * was taken offline. The rules themselves are edited in one place only —
 * Operations → Cancellation policy — and summarised here.
 */
export default function WorkerOps() {
  const [, setParams] = useSearchParams();
  const { data, isLoading, isError } = useAdminWorkerOpsQuery(undefined, { pollingInterval: 20000 });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-zappy-500" /></div>;
  if (isError || !data) return <p className="p-6 text-sm text-rose-600">Could not load worker operations.</p>;

  const s = data.stats || {};
  const policy = data.policy || {};
  const limit = policy.workerCancelLimit;
  const windowHours = policy.workerCancelWindowHours;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Worker Operations</h2>
        <p className="text-sm text-slate-500 mt-1">Single-device, cancellations, escalation and live worker signals.</p>
      </div>
      {/* Live stats */}
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Live now</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
          <Stat icon={Users}   label="Total workers"    value={s.totalWorkers} />
          <Stat icon={UserCheck} label="Online"         value={s.onlineWorkers}     tone="green" />
          <Stat icon={ShieldCheck} label="Available"     value={s.availableWorkers}  tone="indigo" />
          <Stat icon={AlertTriangle} label="Cancelling today" value={s.workersCancellingToday} tone="amber" />
          <Stat icon={AlertTriangle} label="Total cancels" value={s.cancelsToday} tone="amber" />
          <Stat icon={Ban}     label="Auto-offlined"    value={s.workersAtLimit}    tone="rose" />
        </div>
      </div>

      {/* Single-device */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-zappy-50 flex items-center justify-center shrink-0 mb-2 sm:mb-0"><Smartphone size={18} className="text-zappy-600" /></div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-900">Single active device — {data.singleDevice?.enforced ? 'Enforced' : 'Off'}</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            A worker can be signed in on one device at a time; a new login signs the old one out.
            New-device hard block is {data.singleDevice?.hardBlockNewDevice ? 'ON' : 'OFF'} (env <code>WORKER_NEW_DEVICE_BLOCK</code>).
          </p>
        </div>
      </div>

      {/* The policy in force, edited on its own page */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-700">Cancellation & escalation policy</p>
          <button type="button" onClick={() => setParams({ tab: 'cancellation' }, { replace: true })}
            className="text-xs font-bold text-zappy-600 hover:text-zappy-800 flex items-center gap-1">
            Edit policy <ArrowRight size={13} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          More than <b className="text-slate-900">{limit}</b> penalised cancels within <b className="text-slate-900">{windowHours}h</b> takes a worker offline.
          Cancel penalty ₹{policy.workerCancelPenaltyRupees} (×{policy.lateWorkerCancelMultiplier} once on the way),
          no-show ₹{policy.workerNoShowPenaltyRupees}, {policy.workerRejectLimit} rejects in a row marks them unavailable.
        </p>
      </div>

      {/* Live: workers cancelling within the window (most first) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-slate-700">Cancelling now (last {windowHours}h)</p>
          <span className="text-[11px] font-bold text-slate-400">{(data.recentCancellers || []).length} worker(s)</span>
        </div>
        {(data.recentCancellers || []).length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No penalised cancellations in this window. 🎉</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recentCancellers.map((w) => (
              <div key={w.workerId} className="flex items-center gap-3 py-2.5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${w.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} title={w.isOnline ? 'Online' : 'Offline'} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{w.name}</p>
                  {w.phone && <p className="text-[11px] text-slate-400">{w.phone}</p>}
                </div>
                {w.atLimit && (
                  <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                    <Ban size={11} /> AUTO-OFFLINED
                  </span>
                )}
                <span className={`text-sm font-black tabular-nums shrink-0 ${w.atLimit ? 'text-rose-600' : 'text-amber-600'}`}>
                  {w.cancels}<span className="text-slate-300 font-bold">/{limit}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancellation reasons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-600 mb-3">Penalty-free reasons</p>
          <ul className="space-y-2">
            {(data.penaltyFreeReasons || []).map((r) => <li key={r} className="text-sm text-slate-700 flex items-start gap-2"><span className="text-emerald-500 shrink-0">•</span> <span>{r}</span></li>)}
          </ul>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-black uppercase tracking-wide text-amber-600 mb-3">Penalised reasons</p>
          <ul className="space-y-2">
            {(data.penalisedReasons || []).map((r) => <li key={r} className="text-sm text-slate-700 flex items-start gap-2"><span className="text-amber-500 shrink-0">•</span> <span>{r}</span></li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
