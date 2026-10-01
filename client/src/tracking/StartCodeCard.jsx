import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, HelpCircle } from 'lucide-react';

/**
 * The start code — the customer's proof that the right person is at the door.
 *
 * Three states, as in the first version's order flow:
 *   on the way     locked: there is a code, nobody needs it yet
 *   arrived        "is your pro here?": confirm, and only then show it
 *                  (auto-reveals after 90 s so a busy customer isn't stuck)
 *   confirmed      the digits, large, to read out
 *
 * `code` comes from the server only for the customer, only once it's due.
 */
const REVEAL_AFTER_S = 90;

export default function StartCodeCard({ jobKey, code, stage, noun = 'pro' }) {
  const storeKey = `start-code-ok:${jobKey}`;
  const [confirmed, setConfirmed] = useState(() => {
    try { return sessionStorage.getItem(storeKey) === '1'; } catch { return false; }
  });
  const [left, setLeft] = useState(REVEAL_AFTER_S);
  const timer = useRef(null);

  const confirm = () => {
    setConfirmed(true);
    try { sessionStorage.setItem(storeKey, '1'); } catch { /* private mode: reveal for this view */ }
  };

  useEffect(() => {
    if (stage !== 'arrived' || confirmed) return undefined;
    setLeft(REVEAL_AFTER_S);
    timer.current = setInterval(() => setLeft((s) => {
      if (s <= 1) { clearInterval(timer.current); confirm(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(timer.current);
  }, [stage, confirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!code || !['assigned', 'on_the_way', 'arrived'].includes(stage)) return null;

  return (
    <AnimatePresence mode="wait">
      {stage !== 'arrived' ? (
        <motion.div key="locked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="rounded-2xl ring-1 ring-slate-100" style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)' }}>
          <div className="flex items-center gap-3 px-4 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
              <ShieldCheck size={18} className="text-slate-400" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-extrabold text-slate-700">Start code: locked</p>
              <p className="mt-0.5 text-xs text-slate-500">You'll see it when your {noun} arrives</p>
            </div>
            <div className="flex shrink-0 gap-1.5" aria-hidden="true">
              {String(code).split('').map((_, i) => (
                <span key={i} className="flex h-8 w-6 items-center justify-center rounded-lg bg-slate-200 text-sm font-black text-slate-300 blur-[3px]">•</span>
              ))}
            </div>
          </div>
        </motion.div>
      ) : !confirmed ? (
        <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="rounded-[24px] border border-zappy-200/60" style={{ background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)' }}>
          <div className="flex items-center gap-3 px-4 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zappy-100">
              <HelpCircle size={18} className="text-zappy-700" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-extrabold text-zappy-900">Is your {noun} with you?</p>
              <p className="mt-0.5 text-xs text-zappy-700">Confirm to see the start code · shows in {left}s</p>
            </div>
            <button type="button" onClick={confirm} className="rounded-xl bg-zappy-600 px-3 py-1.5 text-xs font-bold text-white">Yes, show</button>
          </div>
        </motion.div>
      ) : (
        <motion.div key="code" initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 260 }}
          className="rounded-[24px]" style={{ background: 'linear-gradient(135deg,#1D4ED8 0%,#2563EB 100%)', boxShadow: '0 12px 32px -4px rgba(37,99,235,0.4)' }}>
          <p className="flex items-center gap-2 px-4 pb-2 pt-4 text-xs font-extrabold uppercase tracking-widest text-white/80">
            <ShieldCheck size={15} /> Share this code to start
          </p>
          <div className="flex justify-center gap-3 px-4 pb-3">
            {String(code).split('').map((d, i) => (
              <span key={i} className="flex h-16 w-14 items-center justify-center rounded-2xl text-4xl font-black text-white" style={{ background: 'rgba(255,255,255,0.18)' }}>{d}</span>
            ))}
          </div>
          <p className="px-4 pb-4 text-center text-[11px] font-semibold text-white/75">Only give it to your {noun} in person. ZappyOne never asks for it.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
