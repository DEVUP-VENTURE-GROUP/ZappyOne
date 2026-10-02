import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Search, UserCheck, Navigation, MapPin, Wrench, CheckCircle2, FileText, X,
} from 'lucide-react';

/**
 * A short notice when a job changes state: who, what changed, what (if
 * anything) the customer should do. White surface, one semantic icon, plain
 * words; it closes itself after a few seconds and never covers the action.
 *
 * `needsYou` overrides the stage when the job is waiting on the customer
 * (a quote to approve), because that is the one change they must act on.
 */
const TONE = {
  neutral: 'bg-sunken text-ink-700',
  brand: 'bg-zappy-50 text-zappy-700',
  success: 'bg-green-50 text-green-700',
  action: 'bg-amber-50 text-amber-800',
};

const STATES = {
  searching: { Icon: Search, tone: 'neutral', title: () => 'Finding a verified pro', body: () => 'We will tell you as soon as someone accepts.' },
  assigned: {
    Icon: UserCheck, tone: 'brand',
    title: (w) => `${w.name || 'Your pro'} accepted your booking`,
    body: (w) => (w.rating ? `Rated ${Number(w.rating).toFixed(1)}${w.jobs ? ` · ${w.jobs} jobs done` : ''}` : 'Verified by ZappyOne'),
  },
  on_the_way: {
    Icon: Navigation, tone: 'brand',
    title: (w) => `${w.name || 'Your pro'} is on the way`,
    body: (w) => (w.eta != null ? `Arriving in about ${w.eta} min.` : 'You can follow them on the map.'),
  },
  arrived: { Icon: MapPin, tone: 'brand', title: (w) => `${w.name || 'Your pro'} has arrived`, body: () => 'Share your start code when you are ready.' },
  in_progress: { Icon: Wrench, tone: 'neutral', title: () => 'Work in progress', body: (w) => `${w.name || 'Your pro'} is working on it.` },
  approval: { Icon: FileText, tone: 'action', title: () => 'Your quote is ready', body: () => 'Review it below. Nothing starts until you approve.' },
  completed: { Icon: CheckCircle2, tone: 'success', title: () => 'Job completed', body: () => 'Your service report is below. Rate the job when you are ready.' },
};

export default function StatusNotificationBanner({ status, needsYou = false, workerName, workerRating, workerJobs, etaMinutes }) {
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(null);
  const prev = useRef(null);
  const timer = useRef(null);
  const key = needsYou ? 'approval' : status;

  useEffect(() => {
    if (!key || key === prev.current) return undefined;
    const first = prev.current === null;
    prev.current = key;
    // Nothing to announce on the screen's first paint unless it needs them.
    if (first && key !== 'approval') return undefined;
    if (!STATES[key]) return undefined;
    setCurrent(key);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCurrent(null), key === 'approval' ? 8000 : 5000);
    return () => clearTimeout(timer.current);
  }, [key]);

  const cfg = current && STATES[current];
  const w = { name: workerName, rating: workerRating, jobs: workerJobs, eta: etaMinutes };

  return (
    <AnimatePresence>
      {cfg && (
        <motion.div
          key={current}
          role="status"
          aria-live="polite"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed inset-x-3 top-3 z-[90] mx-auto flex max-w-md items-start gap-3 rounded-card border border-line bg-white p-3.5 shadow-float"
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-btn ${TONE[cfg.tone]}`}>
            <cfg.Icon size={18} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-snug text-ink-900">{cfg.title(w)}</span>
            <span className="block text-[13px] leading-snug text-ink-500">{cfg.body(w)}</span>
          </span>
          <button type="button" onClick={() => setCurrent(null)} aria-label="Dismiss"
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-btn text-ink-400 hover:bg-sunken">
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
