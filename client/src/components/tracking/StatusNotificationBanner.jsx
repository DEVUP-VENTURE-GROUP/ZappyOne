/**
 * StatusNotificationBanner
 *
 * Full-width animated banner that slides in from the top whenever order
 * status changes (assigned, on_the_way, arrived, in_progress, completed).
 * Includes worker name, rating, message, and a contextual emoji.
 * Auto-dismisses after 5 s; user can also swipe/tap to dismiss.
 *
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, Zap } from 'lucide-react';

const STATUS_CONFIG = {
  searching: {
    emoji: '🔍',
    title: 'Finding your worker…',
    body: (w) => 'Scanning nearby workers — sit tight',
    bg: 'linear-gradient(135deg,#1e293b 0%,#0f172a 100%)',
    glow: 'rgba(59,130,246,0.4)',
    badge: null,
  },
  assigned: {
    emoji: '⚡',
    title: (w) => `${w?.name || 'Worker'} accepted your request`,
    body: (w) => `${w?.rating ? `${w.rating.toFixed(1)}★  ·` : ''} ${w?.jobs ? `${w.jobs}+ jobs completed` : 'Verified worker'}`,
    bg: 'linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%)',
    glow: 'rgba(37,99,235,0.45)',
    badge: '✓ Matched',
  },
  on_the_way: {
    emoji: '🛵',
    title: (w) => `${w?.name || 'Worker'} is on the way!`,
    body: (w) => w?.eta != null ? `ETA: ~${w.eta} min — heading to you now` : 'Heading to your location right now',
    bg: 'linear-gradient(135deg,#0369a1 0%,#0284c7 100%)',
    glow: 'rgba(2,132,199,0.45)',
    badge: '📍 En route',
  },
  arrived: {
    emoji: '📍',
    title: (w) => `${w?.name || 'Worker'} has arrived!`,
    body: () => 'Worker is at your location — share your OTP to begin',
    bg: 'linear-gradient(135deg,#15803d 0%,#16a34a 100%)',
    glow: 'rgba(21,128,61,0.45)',
    badge: '🎯 Here',
  },
  in_progress: {
    emoji: '🔧',
    title: () => 'Service in progress',
    body: (w) => `${w?.name || 'Worker'} is working on your request`,
    bg: 'linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%)',
    glow: 'rgba(124,58,237,0.45)',
    badge: null,
  },
  completed: {
    emoji: '🎉',
    title: () => 'Service completed!',
    body: () => 'Hope everything went smoothly — rate your experience',
    bg: 'linear-gradient(135deg,#b45309 0%,#d97706 100%)',
    glow: 'rgba(180,83,9,0.45)',
    badge: '✅ Done',
  },
};

export default function StatusNotificationBanner({ status, workerName, workerRating, workerJobs, etaMinutes }) {
  const [visible, setVisible]       = useState(false);
  const [current, setCurrent]       = useState(null);
  const prevStatusRef               = useRef(null);
  const timerRef                    = useRef(null);

  useEffect(() => {
    if (!status || status === prevStatusRef.current) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    // Don't flash on very first mount (searching is the initial state)
    if (prev === null && status === 'searching') return;

    const cfg = STATUS_CONFIG[status];
    if (!cfg) return;

    const worker = { name: workerName, rating: workerRating, jobs: workerJobs, eta: etaMinutes };
    setCurrent({ ...cfg, worker });
    setVisible(true);

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 6000);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update ETA in the banner live while it's showing
  useEffect(() => {
    if (visible && current && status === 'on_the_way') {
      setCurrent(prev => prev ? { ...prev, worker: { ...prev.worker, eta: etaMinutes } } : prev);
    }
  }, [etaMinutes, visible, status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;

  const cfg = current;
  const w   = current.worker;

  const title = typeof cfg.title === 'function' ? cfg.title(w) : cfg.title;
  const body  = typeof cfg.body  === 'function' ? cfg.body(w)  : cfg.body;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`notif-${status}`}
          initial={{ y: -80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0,   opacity: 1, scale: 1    }}
          exit={{    y: -60, opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="fixed top-0 inset-x-0 z-[300] px-3 pt-3 pointer-events-none"
        >
          <motion.div
            className="max-w-lg mx-auto rounded-2xl overflow-hidden pointer-events-auto"
            style={{
              background: cfg.bg,
              boxShadow: `0 12px 40px ${cfg.glow}, 0 4px 16px rgba(0,0,0,0.25)`,
            }}
            animate={{
              boxShadow: [
                `0 12px 40px ${cfg.glow}, 0 4px 16px rgba(0,0,0,0.25)`,
                `0 16px 56px ${cfg.glow}, 0 4px 20px rgba(0,0,0,0.3)`,
                `0 12px 40px ${cfg.glow}, 0 4px 16px rgba(0,0,0,0.25)`,
              ],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {/* Progress drain bar */}
            <motion.div
              className="h-0.5 bg-white/30 origin-left"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 6, ease: 'linear' }}
            />

            <div className="px-4 py-3 flex items-center gap-3">
              {/* Emoji + avatar */}
              <div className="relative shrink-0">
                <motion.div
                  className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl"
                  animate={{ scale: [1, 1.12, 1], rotate: [0, -6, 6, 0] }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                >
                  {cfg.emoji}
                </motion.div>
                {cfg.badge && (
                  <span className="absolute -bottom-1 -right-1 text-[9px] font-black text-white bg-black/30 backdrop-blur-sm px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    {cfg.badge}
                  </span>
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white leading-tight truncate">{title}</p>
                <p className="text-[11px] text-white/65 mt-0.5 leading-snug">{body}</p>
                {/* Worker mini-rating row */}
                {w?.rating && status !== 'searching' && (
                  <div className="flex items-center gap-1 mt-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={9}
                        strokeWidth={0}
                        className={i < Math.round(w.rating) ? 'fill-amber-300' : 'fill-white/20'}
                      />
                    ))}
                    <span className="text-[9px] font-bold text-white/50 ml-0.5">{w.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {/* Dismiss */}
              <motion.button
                onClick={() => setVisible(false)}
                className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0"
                whileTap={{ scale: 0.88 }}
              >
                <X size={12} className="text-white/70" />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
