import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Zap, Lock, Clock, Loader2 } from 'lucide-react';
import { useGetReadyModeQuery, useSetReadyModeMutation } from '../../services/api';

function msLeft(until) {
  if (!until) return 0;
  return Math.max(0, until - Date.now());
}

/**
 * ZeroWait — Ready Mode.
 * The worker pre-accepts the next matching job, so dispatch can assign them with
 * NO offer/accept round-trip. They earn a bonus for it. Strictly opt-in, time-boxed,
 * and gated to high-trust workers (the server enforces all of it).
 */
export default function ReadyModeCard() {
  const { data, isLoading } = useGetReadyModeQuery(undefined, { pollingInterval: 30000 });
  const [setReady, { isLoading: saving }] = useSetReadyModeMutation();
  const [remaining, setRemaining] = useState(0);

  const ready = !!data?.ready;
  const until = data?.until;

  // Live countdown while Ready Mode is active.
  useEffect(() => {
    if (!ready || !until) { setRemaining(0); return; }
    setRemaining(msLeft(until));
    const id = setInterval(() => setRemaining(msLeft(until)), 1000);
    return () => clearInterval(id);
  }, [ready, until]);

  if (isLoading || !data) return null;
  if (!data.enabledOnPlatform) return null; // admin disabled the feature

  const bonusRs = Math.round((data.bonusPaise || 0) / 100);
  const blocked = !ready && !!data.ineligibleReason;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  async function toggle() {
    try {
      if (ready) {
        await setReady({ enabled: false }).unwrap();
        toast('Ready Mode off');
      } else {
        const r = await setReady({
          enabled: true,
          radiusKm: data.maxRadiusKm,
          minutes: data.maxMinutes,
        }).unwrap();
        toast.success(`⚡ Ready Mode on — next job within ${r.radiusKm}km is auto-accepted`);
      }
    } catch (err) {
      toast.error(err?.data?.error || 'Could not change Ready Mode');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 border ${
        ready
          ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50'
          : blocked
            ? 'border-slate-200 bg-slate-50'
            : 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          ready ? 'bg-emerald-500' : blocked ? 'bg-slate-300' : 'bg-indigo-500'
        }`}>
          {blocked ? <Lock size={17} className="text-white" /> : <Zap size={18} className="text-white fill-white" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-slate-900">Ready Mode</p>
            {ready && (
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
              </span>
            )}
          </div>

          {blocked ? (
            <p className="text-[12.5px] text-slate-500 mt-1 leading-snug">{data.ineligibleReason}</p>
          ) : ready ? (
            <p className="text-[12.5px] text-emerald-800 mt-1 leading-snug">
              Next job within <b>{data.radiusKm} km</b> is auto-accepted — no tap needed.
              {bonusRs > 0 && <> You earn <b>+₹{bonusRs}</b> on completion.</>}
            </p>
          ) : (
            <p className="text-[12.5px] text-slate-600 mt-1 leading-snug">
              Auto-accept the next job near you and skip the queue.
              {bonusRs > 0 && <> Earn <b>+₹{bonusRs}</b> extra per job.</>}
            </p>
          )}

          {ready && remaining > 0 && (
            <p className="text-[11px] font-bold text-emerald-700 mt-1.5 flex items-center gap-1">
              <Clock size={11} /> {mins}m {String(secs).padStart(2, '0')}s left
            </p>
          )}
        </div>
      </div>

      {!blocked && (
        <button
          onClick={toggle}
          disabled={saving}
          className={`mt-3 w-full h-10 rounded-xl font-black text-[13px] flex items-center justify-center gap-2 transition-colors disabled:opacity-60 ${
            ready
              ? 'bg-white text-emerald-700 border border-emerald-300'
              : 'bg-indigo-600 text-white'
          }`}
        >
          {saving
            ? <Loader2 size={15} className="animate-spin" />
            : ready
              ? 'Turn off'
              : <><Zap size={14} className="fill-white" /> Go Ready {data.maxMinutes ? `· ${data.maxMinutes}m` : ''}</>}
        </button>
      )}
    </motion.div>
  );
}
