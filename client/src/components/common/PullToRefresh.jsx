import { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import haptics from '../../utils/haptics';

/**
 * Native-style pull-to-refresh for the main tabs. Only engages when the page is
 * scrolled to the very top and the user drags down; past the threshold it fires
 * onRefresh() with a branded Zappy-bolt spinner + a haptic tick. No-ops on
 * desktop / non-touch. Rubber-band resistance keeps it feeling premium.
 */
const THRESHOLD = 70;   // px pull to trigger
const MAX_PULL = 110;   // px cap (resistance beyond)

export default function PullToRefresh({ onRefresh, children, className = '' }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const armed = useRef(false);
  const ticked = useRef(false);

  const onTouchStart = useCallback((e) => {
    if (refreshing) return;
    // Only arm when the page is at the very top.
    armed.current = (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    startY.current = e.touches[0].clientY;
    ticked.current = false;
  }, [refreshing]);

  const onTouchMove = useCallback((e) => {
    if (!armed.current || refreshing || startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) { setPull(0); return; }
    // Rubber-band resistance.
    const resisted = Math.min(MAX_PULL, dy * 0.5);
    setPull(resisted);
    if (resisted >= THRESHOLD && !ticked.current) { ticked.current = true; haptics.tick(); }
    else if (resisted < THRESHOLD) ticked.current = false;
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (!armed.current || refreshing) { setPull(0); return; }
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(THRESHOLD);
      haptics.light();
      try { await onRefresh?.(); } catch { /* surfaced elsewhere */ }
      finally { setRefreshing(false); setPull(0); }
    } else {
      setPull(0);
    }
    armed.current = false;
    startY.current = null;
  }, [pull, refreshing, onRefresh]);

  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div className={className} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Pull indicator */}
      <div className="relative">
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none"
          style={{ top: 8 }}
          animate={{ y: (refreshing ? THRESHOLD : pull) - 34, opacity: pull > 4 || refreshing ? 1 : 0 }}
          transition={{ type: refreshing ? 'spring' : 'tween', duration: refreshing ? undefined : 0 }}
        >
          <div className="w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center">
            <motion.div
              animate={refreshing ? { rotate: 360 } : { rotate: progress * 270, scale: 0.7 + progress * 0.3 }}
              transition={refreshing ? { repeat: Infinity, duration: 0.7, ease: 'linear' } : { duration: 0 }}
            >
              <Zap size={18} className={progress >= 1 || refreshing ? 'text-zappy-600 fill-zappy-600' : 'text-slate-400'} strokeWidth={2.5} />
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Content shifts down while pulling */}
      <motion.div animate={{ y: refreshing ? THRESHOLD * 0.5 : pull * 0.5 }} transition={{ type: refreshing ? 'spring' : 'tween', duration: refreshing ? undefined : 0 }}>
        {children}
      </motion.div>
    </div>
  );
}
