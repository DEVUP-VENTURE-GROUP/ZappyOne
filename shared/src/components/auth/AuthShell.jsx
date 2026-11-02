import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

// The sign-in frame for every ZappyOne website: a moving photo panel saying what this site is for (a band on top on a phone), and the form.
export default function AuthShell({ photos = [], eyebrow, pitch, points = [], title, subtitle, children, footer }) {
  const still = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (still || photos.length < 2) return undefined;
    const t = setInterval(() => setShown((i) => (i + 1) % photos.length), 5200);
    return () => clearInterval(t);
  }, [still, photos.length]);
  const words = String(pitch || '').split(' ');

  const slideshow = (
    <AnimatePresence initial={false}>
      <motion.img
        key={photos[shown]}
        src={photos[shown]}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        initial={{ opacity: 0, scale: 1.12 }}
        animate={{ opacity: 0.6, scale: still ? 1.04 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ opacity: { duration: 1.2 }, scale: { duration: 7, ease: 'linear' } }}
      />
    </AnimatePresence>
  );

  return (
    <div className="flex min-h-[100dvh] w-full bg-white font-sans">
      <aside className="relative hidden w-[46%] max-w-[720px] shrink-0 overflow-hidden bg-ink-900 lg:block">
        {slideshow}
        <div className="absolute inset-0 bg-ink-900/40" />
        <RouteLine className="absolute right-[8%] top-[14%] w-[46%] max-w-[300px]" still={still} />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <motion.img src="/logo.png" alt="ZappyOne" className="h-10 w-auto self-start" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} />
          <div className="max-w-[480px]">
            <motion.p className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>{eyebrow}</motion.p>
            <h2 className="mt-3 text-[38px] font-extrabold leading-[1.1] tracking-tight text-white xl:text-[46px]">
              {words.map((w, i) => (
                <span key={`${w}${i}`} className="inline-block overflow-hidden pb-1 align-bottom">
                  <motion.span className="inline-block" initial={{ y: still ? 0 : '110%', opacity: still ? 0 : 1 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 + i * 0.07, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
                    {w}&nbsp;
                  </motion.span>
                </span>
              ))}
            </h2>
            <ul className="mt-8 space-y-3.5">
              {points.map((p, i) => (
                <motion.li key={p} className="flex items-start gap-3 text-[15px] font-medium text-white/90"
                  initial={{ opacity: 0, x: still ? 0 : -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.75 + i * 0.12, duration: 0.5 }}>
                  <motion.span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zappy-600 text-white"
                    initial={{ scale: still ? 1 : 0 }} animate={{ scale: 1 }} transition={{ delay: 0.85 + i * 0.12, type: 'spring', stiffness: 400, damping: 14 }}>
                    <Check size={12} strokeWidth={3.5} />
                  </motion.span>
                  {p}
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col lg:justify-center lg:px-8 lg:py-12">
        <div className="relative h-[200px] shrink-0 overflow-hidden bg-ink-900 lg:hidden">
          {slideshow}
          <div className="absolute inset-0 bg-ink-900/35" />
          <RouteLine className="absolute bottom-4 right-4 w-[46%] max-w-[190px]" still={still} />
          <img src="/logo.png" alt="ZappyOne" className="absolute left-5 top-[max(1.25rem,env(safe-area-inset-top))] h-8 w-auto" />
          <p className="absolute bottom-5 left-5 max-w-[55%] text-[15px] font-bold leading-snug text-white [text-wrap:balance]">{pitch}</p>
        </div>

        <motion.div
          className="relative z-10 -mt-5 flex w-full flex-1 flex-col rounded-t-sheet bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-8 lg:mx-auto lg:mt-0 lg:max-w-[400px] lg:flex-none lg:rounded-none lg:p-0"
          initial={{ opacity: 0, y: still ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <AnimatePresence mode="wait">
            <motion.div key={title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink-900 [text-wrap:balance] sm:text-[28px]">{title}</h1>
              {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-ink-500 [text-wrap:pretty]">{subtitle}</p>}
            </motion.div>
          </AnimatePresence>
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-auto pt-10 lg:mt-10 lg:pt-0">{footer}</div>}
        </motion.div>
      </main>
    </div>
  );
}

const TRIP_MS = 2600;
const REST_MS = 1400;
const START_MIN = 6;

// A pro on the way: the route draws itself, a dot travels it with the minutes counting down, and the customer's pin pulses on arrival. Illustration of live tracking, no data.
function RouteLine({ className, still }) {
  const d = 'M12 108 C 60 108, 58 52, 110 58 S 170 20, 206 22';
  const [trip, setTrip] = useState(0);
  const [mins, setMins] = useState(still ? 0 : START_MIN);
  useEffect(() => {
    if (still) return undefined;
    const began = Date.now();
    setMins(START_MIN);
    const tick = setInterval(() => {
      const t = Date.now() - began;
      setMins(t >= TRIP_MS ? 0 : Math.max(1, Math.ceil(START_MIN * (1 - t / TRIP_MS))));
    }, 100);
    const next = setTimeout(() => setTrip((n) => n + 1), TRIP_MS + REST_MS);
    return () => { clearInterval(tick); clearTimeout(next); };
  }, [trip, still]);
  const run = still ? { duration: 0 } : { duration: TRIP_MS / 1000, ease: 'easeInOut' };
  return (
    <div className={className} aria-hidden="true">
      <div className="mb-2 flex justify-end">
        <motion.div layout className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-lg">
          <span className="relative flex h-2 w-2">
            {!still && mins > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold text-ink-500">Live tracking</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={mins} className="text-[12px] font-extrabold tabular-nums text-ink-900"
              initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.18 }}>
              {mins > 0 ? `${mins} min` : 'Arrived'}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>
      <svg viewBox="0 0 230 130" className="w-full">
        <path d={d} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 8" />
        <motion.path key={`p${trip}`} d={d} fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round"
          initial={{ pathLength: still ? 1 : 0 }} animate={{ pathLength: 1 }} transition={run} />
        <circle cx="12" cy="108" r="7" fill="#1F4FD8" stroke="#FFFFFF" strokeWidth="2.5" />
        {!still && (
          <motion.circle key={`c${trip}`} r="5" fill="#FFFFFF" style={{ offsetPath: `path('${d}')` }}
            initial={{ offsetDistance: '0%' }} animate={{ offsetDistance: '100%' }} transition={run} />
        )}
        <g transform="translate(206 22)">
          {!still && (
            <motion.circle r="10" fill="none" stroke="#F59E0B" strokeWidth="2"
              initial={{ scale: 0.6, opacity: 0.9 }} animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
          )}
          <path d="M0 6 C -9 -4, -8 -15, 0 -15 S 9 -4, 0 6 Z" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="2" />
          <circle cy="-8" r="3" fill="#FFFFFF" />
        </g>
      </svg>
    </div>
  );
}
