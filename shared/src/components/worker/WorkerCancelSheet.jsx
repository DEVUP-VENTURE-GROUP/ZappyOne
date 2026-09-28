import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { X, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import { useLazyGetWorkerCancelPreviewQuery, useWorkerCancelMutation } from '../../services/api';

/**
 * Worker "Cancel job" sheet. Two steps:
 *   1. pick a reason  →  fetch the penalty/consequence preview for that reason
 *   2. review (penalty, escalation warning)  →  confirm
 * Genuine reasons are penalty-free; repeated penalised cancels can take the
 * worker offline (server-enforced).
 */
export default function WorkerCancelSheet({ orderId, open, onClose, onCancelled }) {
  const [reason, setReason] = useState(null);
  const [fetchPreview, { data: preview, isFetching }] = useLazyGetWorkerCancelPreviewQuery();
  const [cancel, { isLoading: cancelling }] = useWorkerCancelMutation();

  // Load the reason list (preview with no reason) when opened.
  useEffect(() => {
    if (open) { setReason(null); fetchPreview({ id: orderId }); }
  }, [open, orderId, fetchPreview]);

  // Re-price when a reason is chosen.
  useEffect(() => {
    if (open && reason) fetchPreview({ id: orderId, reason });
  }, [reason, open, orderId, fetchPreview]);

  const reasons = preview?.reasons || [];

  async function confirm() {
    try {
      const res = await cancel({ id: orderId, reason }).unwrap();
      if (res.escalated) toast.error("You've been set offline for repeated cancellations.", { duration: 6000 });
      else toast.success('Job cancelled. Finding a new pro for the customer.');
      onCancelled?.();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not cancel');
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[120] flex flex-col justify-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <div className="absolute inset-0 bg-black/50" />
          <motion.div
            className="relative bg-white rounded-t-3xl pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-3" />
            <div className="flex items-center justify-between px-5 mb-3">
              <p className="font-extrabold text-lg text-[#0F172A]">Cancel this job?</p>
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={16} /></button>
            </div>

            <div className="px-5 space-y-2.5">
              <p className="text-sm text-slate-500 -mt-1 mb-1">Tell us why. Genuine reasons have no penalty.</p>

              {isFetching && !reasons.length ? (
                <div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : reasons.map((r) => (
                <button key={r.code} onClick={() => setReason(r.code)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border text-left transition ${reason === r.code ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                  <span className="text-sm font-semibold text-[#0F172A]">{r.label}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {r.genuine
                      ? <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">NO PENALTY</span>
                      : <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">PENALTY</span>}
                    <ChevronRight size={16} className="text-slate-300" />
                  </span>
                </button>
              ))}

              {/* Consequence preview for the chosen reason */}
              {reason && preview && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 mt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Penalty</span>
                    <span className={`font-black ${preview.penaltyRupees > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {preview.penaltyRupees > 0 ? `−₹${preview.penaltyRupees}` : 'None'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Cancellations today</span>
                    <span className="font-semibold text-slate-600">{preview.cancelsInWindow} / {preview.limit}</span>
                  </div>
                  {preview.willEscalate && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mt-1">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      This will hit your limit — you'll be set offline for a while.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 pt-4">
              <button onClick={onClose} className="flex-1 h-12 rounded-2xl border border-slate-200 font-bold text-slate-700">Keep job</button>
              <button onClick={confirm} disabled={!reason || cancelling || (reason && isFetching)}
                className="flex-1 h-12 rounded-2xl bg-rose-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {cancelling ? <Loader2 size={16} className="animate-spin" /> : null} Cancel job
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
