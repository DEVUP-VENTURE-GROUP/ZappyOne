import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { reducedMotion } from '../../lib/animations';

/**
 * Material-style tap ripple, scoped to the catalog's interactive surfaces
 * (filter chips, Book Now buttons, banner CTA).
 *
 * Kept as a hook + layer instead of a wrapper component so it can be dropped
 * into elements that already own their own children and layout. The host must
 * be `relative overflow-hidden`. Skipped entirely under prefers-reduced-motion.
 */

let nextId = 0;

export function useRipple() {
  const [ripples, setRipples] = useState([]);

  const spawn = useCallback((event) => {
    if (reducedMotion) return;
    const host = event.currentTarget;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    // Pointer position for a real tap; centre for keyboard activation.
    const x = event.clientX ? event.clientX - rect.left : rect.width / 2;
    const y = event.clientY ? event.clientY - rect.top : rect.height / 2;
    const size = Math.max(rect.width, rect.height) * 2;
    const id = ++nextId;
    setRipples((prev) => [...prev, { id, x, y, size }]);
    window.setTimeout(
      () => setRipples((prev) => prev.filter((r) => r.id !== id)),
      520,
    );
  }, []);

  return { ripples, spawn };
}

export function RippleLayer({ ripples, color = 'rgba(255,255,255,0.45)' }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            className="absolute rounded-full"
            style={{
              left: r.x - r.size / 2,
              top: r.y - r.size / 2,
              width: r.size,
              height: r.size,
              background: color,
            }}
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
    </span>
  );
}
