import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

const HOLD_MS = 5000;
const DOTS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  return { x: Math.cos(a) * (90 + (i % 3) * 22), y: Math.sin(a) * (90 + (i % 3) * 22), c: i % 3 === 2 ? '#F59E0B' : i % 2 ? '#1F4FD8' : '#93B4F8', s: 6 + (i % 3) * 2 };
});

// The few seconds after Confirm: the booking is real, what happens next, then tracking opens on its own.
export default function BookedCelebration({ title = 'Booking confirmed', lines = [], reference, noun = 'pro', onDone }) {
  const reduce = useReducedMotion();
  const done = useRef(false);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };
  useEffect(() => { const t = setTimeout(finish, reduce ? 2500 : HOLD_MS); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const next = [['Booking placed', true], [`Finding the nearest ${noun}`, false], ['You will get their name and start code here', false]];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[300] flex flex-col bg-white" role="dialog" aria-modal="true" aria-labelledby="booked-title">
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative grid h-28 w-28 place-items-center">
          {!reduce && [0, 0.35].map((d) => (
            <motion.span key={d} className="absolute inset-0 rounded-full border-2 border-zappy-600"
              initial={{ scale: 0.6, opacity: 0.6 }} animate={{ scale: 2.1, opacity: 0 }} transition={{ delay: 0.45 + d, duration: 1.4, ease: 'easeOut' }} />
          ))}
          {!reduce && DOTS.map((p, i) => (
            <motion.span key={i} className="absolute rounded-full" style={{ width: p.s, height: p.s, background: p.c }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0 }} animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0, 1, 0.6] }}
              transition={{ delay: 0.5, duration: 1.2, ease: 'easeOut' }} />
          ))}
          <motion.span className="grid h-28 w-28 place-items-center rounded-full bg-zappy-600"
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
            <svg viewBox="0 0 52 52" className="h-14 w-14" aria-hidden="true">
              <motion.path d="M14 27 l8 8 l16 -18" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.45, ease: 'easeOut' }} />
            </svg>
          </motion.span>
        </div>

        <motion.h1 id="booked-title" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
          className="mt-9 text-center text-[26px] font-extrabold tracking-[-0.02em] text-ink-900">{title}</motion.h1>
        {lines.filter(Boolean).map((l, i) => (
          <motion.p key={l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.95 + i * 0.1 }}
            className="mt-1 text-center text-[15px] text-ink-500">{l}</motion.p>
        ))}
        {reference && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
            className="mt-3 rounded-full bg-sunken px-3 py-1 text-[13px] font-semibold tabular-nums text-ink-700">Booking ID {reference}</motion.p>
        )}

        <ul className="mt-8 w-full max-w-xs space-y-3.5">
          {next.map(([label, ticked], i) => (
            <motion.li key={label} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.5 + i * 0.55 }}
              className="flex items-center gap-3 text-[14.5px] text-ink-900">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${ticked ? 'bg-green-600 text-white' : 'bg-zappy-50 text-zappy-700'}`}>
                {ticked ? <Check size={15} strokeWidth={3} /> : i === 1 ? <Loader2 size={15} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              {label}
            </motion.li>
          ))}
        </ul>
      </div>

      <div className="px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={finish} className="btn-primary mx-auto h-12 w-full max-w-sm text-[15.5px]">Track my booking</button>
        <div className="mx-auto mt-4 h-1 w-full max-w-sm overflow-hidden rounded-full bg-sunken">
          <motion.div className="h-full bg-zappy-600" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: (reduce ? 2500 : HOLD_MS) / 1000, ease: 'linear' }} />
        </div>
      </div>
    </motion.div>
  );
}
