import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Save, ShieldCheck, Users, UserCheck, Ban, AlertTriangle, Smartphone } from 'lucide-react';
import {
  useAdminWorkerOpsQuery,
  useAdminUpdateCancellationConfigMutation,
} from '@shared/services/api';

const inp = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400';

function Stat({ icon: Icon, label, value, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900', green: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600', indigo: 'text-indigo-600',
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

export default function WorkerOps() {
  const { data, isLoading } = useAdminWorkerOpsQuery(undefined, { pollingInterval: 20000 });
  const [update, { isLoading: saving }] = useAdminUpdateCancellationConfigMutation();
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (data?.policy) {
      setForm({
        maxDailyWorkerCancels:      data.policy.maxDailyWorkerCancels,
        workerCancelWindowHours:    data.policy.workerCancelWindowHours,
        workerCancelPenaltyRupees:  data.policy.workerCancelPenaltyRupees,
        lateWorkerCancelMultiplier: data.policy.lateWorkerCancelMultiplier,
        workerNoShowPenaltyRupees:  data.policy.workerNoShowPenaltyRupees,
        workerRejectLimit:          data.policy.workerRejectLimit,
      });
    }
  }, [data]);

  if (isLoading || !form) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-500" /></div>;

  const num = (k) => (e) => setForm((p) => ({ ...p, [k]: Number(e.target.value) }));
  const s = data.stats || {};

  async function save() {
    try {
      // Persist to the cancellation config (rupees → paise, hours → seconds).
      await update({
        maxDailyWorkerCancels:      form.maxDailyWorkerCancels,
        workerCancelLimit:          form.maxDailyWorkerCancels, // keep legacy alias in sync
        workerCancelWindowSec:      Math.round(form.workerCancelWindowHours * 3600),
        workerCancelPenaltyPaise:   Math.round(form.workerCancelPenaltyRupees * 100),
        lateWorkerCancelMultiplier: form.lateWorkerCancelMultiplier,
        workerNoShowPenaltyPaise:   Math.round(form.workerNoShowPenaltyRupees * 100),
        workerRejectLimit:          form.workerRejectLimit,
      }).unwrap();
      toast.success('Worker operations policy saved');
    } catch (err) { toast.error(err?.data?.error || 'Save failed'); }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Worker Operations</h2>
        <p className="text-sm text-slate-500 mt-1">Single-device, cancellations, escalation and live worker signals — all in one place.</p>
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
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 mb-2 sm:mb-0"><Smartphone size={18} className="text-indigo-600" /></div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-900">Single active device — {data.singleDevice?.enforced ? 'Enforced' : 'Off'}</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            A worker can be signed in on one device at a time; a new login signs the old one out.
            New-device hard block is {data.singleDevice?.hardBlockNewDevice ? 'ON' : 'OFF'} (env <code>WORKER_NEW_DEVICE_BLOCK</code>).
          </p>
        </div>
      </div>

      {/* Cancellation & escalation policy */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-bold text-slate-700 mb-4">Cancellation & escalation policy</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Max cancels before auto-offline</label>
            <input type="number" min="1" className={inp} value={form.maxDailyWorkerCancels} onChange={num('maxDailyWorkerCancels')} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Cancel window (hours)</label>
            <input type="number" min="1" className={inp} value={form.workerCancelWindowHours} onChange={num('workerCancelWindowHours')} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Cancel penalty (₹)</label>
            <input type="number" min="0" className={inp} value={form.workerCancelPenaltyRupees} onChange={num('workerCancelPenaltyRupees')} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Late-cancel multiplier (×)</label>
            <input type="number" min="1" step="0.5" className={inp} value={form.lateWorkerCancelMultiplier} onChange={num('lateWorkerCancelMultiplier')} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">No-show penalty (₹)</label>
            <input type="number" min="0" className={inp} value={form.workerNoShowPenaltyRupees} onChange={num('workerNoShowPenaltyRupees')} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Reject limit</label>
            <input type="number" min="1" className={inp} value={form.workerRejectLimit} onChange={num('workerRejectLimit')} />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-4 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
          A worker who exceeds <b className="text-slate-900">{form.maxDailyWorkerCancels}</b> penalised cancels within <b className="text-slate-900">{form.workerCancelWindowHours}h</b> is automatically set offline.
        </p>
        <button onClick={save} disabled={saving}
          className="mt-5 w-full bg-slate-900 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-slate-800 transition-colors">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save policy
        </button>
      </div>

      {/* Live: workers cancelling within the window (most first) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-slate-700">Cancelling now (last {form.workerCancelWindowHours}h)</p>
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
                  {w.cancels}<span className="text-slate-300 font-bold">/{form.maxDailyWorkerCancels}</span>
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
