import { motion } from 'framer-motion';
import { ShieldCheck, Loader2 } from 'lucide-react';

/**
 * The customer's handover code, in the three states it actually has.
 *
 * Lifted out of OrderTrackingPage, where this design already existed but was
 * welded to one screen and one status vocabulary — so the repair flow, which
 * needs the same card at up to three different moments, could not use a line of
 * it. The visual language is unchanged; only the words and the trigger move.
 *
 *   locked   — a code exists but it is not yours to read yet
 *   waiting  — the step that needs it has not been reached
 *   ready    — read this out
 *
 * Locked is deliberately shown rather than hidden: a customer who can see the
 * code is coming does not ring support to ask how the technician will prove
 * who they are.
 */
export default function HandoverCodeCard({
  code,
  state = code ? 'ready' : 'locked',
  title,
  hint,
  lockedTitle = 'Handover code — locked',
  lockedHint = 'Revealed when your technician is ready for it',
}) {
  if (state === 'waiting') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-4 ring-1 ring-slate-100"
        style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)' }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
          <Loader2 size={17} className="animate-spin text-slate-400" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-extrabold text-slate-700">{lockedTitle}</span>
          <span className="mt-0.5 block text-xs text-slate-400">{lockedHint}</span>
        </span>
      </motion.div>
    );
  }

  if (state === 'locked' || !code) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-4 ring-1 ring-slate-100"
        style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)' }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
          <ShieldCheck size={18} strokeWidth={2} className="text-slate-400" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-extrabold text-slate-700">{lockedTitle}</span>
          <span className="mt-0.5 block text-xs text-slate-400">{lockedHint}</span>
        </span>
        <span className="flex shrink-0 gap-1.5">
          {[...Array(6)].map((_, i) => (
            <span key={i} className="flex h-8 w-7 items-center justify-center rounded-lg bg-slate-200">
              <span className="text-sm font-black text-slate-300 blur-[3px]">•</span>
            </span>
          ))}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 260 }}
      className="overflow-hidden rounded-[24px] border border-white/10"
      style={{
        background: 'linear-gradient(135deg, #7c3aed 0%, #2563EB 100%)',
        boxShadow: '0 12px 32px -4px rgba(124,58,237,0.4)',
      }}
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <ShieldCheck size={15} strokeWidth={2} className="text-white/80" />
        <p className="text-xs font-extrabold uppercase tracking-widest text-white/80">{title}</p>
      </div>

      <div className="flex justify-center gap-2.5 px-4 pb-3">
        {String(code).split('').map((digit, i) => (
          <span
            key={i}
            className="flex h-14 w-12 items-center justify-center rounded-2xl sm:h-16 sm:w-14"
            style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
          >
            <span className="text-3xl font-black tracking-tight text-white sm:text-4xl">{digit}</span>
          </span>
        ))}
      </div>

      <p className="px-4 pb-4 text-center text-[11px] font-semibold text-white/70">{hint}</p>
    </motion.div>
  );
}
