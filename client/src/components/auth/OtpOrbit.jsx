import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Lock } from 'lucide-react';
import { reducedMotion } from '../../lib/animations';

/**
 * OTP verification animation — "the row curls onto an orbit".
 *
 * Renders as an overlay on top of the page's existing OTP input row, so the
 * typing experience and every existing style stay exactly as they were. It only
 * takes over once verification actually starts:
 *
 *   verifying → the digits leave the row, settle onto a dotted orbit and spin
 *   success   → the ring lands a quarter-turn on, digits straighten and go
 *               green, then screw down into a single verified tile
 *   error     → the ring flashes and the digits drop back into the row
 *
 * Colour is reserved for verdicts: the orbit runs in the page's own accent
 * while it's working, and green only appears on a real, server-confirmed
 * success — never as decoration. The caller drives `status`, so the animation
 * can't claim a result the API didn't return.
 *
 * Geometry note: tiles are absolutely centred and positioned purely with
 * transforms. Their row coordinates are *measured* from the real inputs, so the
 * hand-off from the static row to the animated overlay is seamless on any page,
 * at any breakpoint, without hardcoding either page's box sizes.
 */

const ORBIT_HEIGHT = 236;
const RADIUS = 76;
const SPIN_MS = 1400;
// A turn and a quarter. Because the tiles counter-rotate to exactly -SETTLE,
// digits land upright while their positions shift 90° — the reference's look.
const SETTLE = 450;

export default function OtpOrbit({
  digits = [],
  status = 'idle',            // 'idle' | 'verifying' | 'success' | 'error'
  accent = '#2563EB',
  tone = 'light',             // 'light' | 'dark' — matches the host page
  inputRefs,                  // refs of the real inputs, used to measure the row
  containerRef,               // the row wrapper, used to measure width
  onSuccessComplete,
  successLabel = 'Verified and secure',
}) {
  const active = status !== 'idle';
  const [metrics, setMetrics] = useState({ w: 44, h: 52, xs: [] });
  const collapseTimer = useRef(null);
  const [collapsed, setCollapsed] = useState(false);

  // Measure the real row so the overlay's starting positions match it exactly.
  useLayoutEffect(() => {
    if (!active) return;
    const box = containerRef?.current?.getBoundingClientRect();
    const first = inputRefs?.current?.[0]?.getBoundingClientRect();
    if (!box || !first) return;
    const xs = (inputRefs.current || []).map((el) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2 - (box.left + box.width / 2); // offset from centre
    });
    setMetrics({ w: first.width, h: first.height, xs });
  }, [active, containerRef, inputRefs]);

  // On success, hold the settled ring briefly, then screw down into one tile.
  useEffect(() => {
    if (status !== 'success') { setCollapsed(false); return undefined; }
    collapseTimer.current = window.setTimeout(() => setCollapsed(true), reducedMotion ? 0 : 620);
    return () => window.clearTimeout(collapseTimer.current);
  }, [status]);

  if (!active) return null;

  const n = digits.length || 6;
  const spinning = status === 'verifying';
  const settled = status === 'success';
  const failed = status === 'error';

  const ringColor = failed ? '#EF4444' : settled ? '#22C55E' : accent;
  const tileBg = tone === 'dark' ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const tileText = tone === 'dark' ? '#FFFFFF' : '#0F172A';

  // Group rotation: loops while working, then lands on SETTLE (always forward,
  // since the loop keeps the live value inside 0–360).
  const groupAnimate = settled || failed
    ? { rotate: failed ? 0 : SETTLE }
    : { rotate: reducedMotion ? 0 : 360 };
  const groupTransition = settled
    ? { duration: 0.55, ease: [0.16, 1, 0.3, 1] }
    : failed
      ? { duration: 0.3 }
      : { duration: SPIN_MS / 1000, ease: 'linear', repeat: reducedMotion ? 0 : Infinity };

  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center"
      initial={{ height: metrics.h }}
      animate={{ height: reducedMotion ? metrics.h : ORBIT_HEIGHT }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      aria-live="polite"
      aria-label={
        settled ? 'Code verified' : failed ? 'Verification failed' : 'Verifying your code'
      }
    >
      <div className="relative flex h-full w-full items-center justify-center">
        {/* Dotted orbit track */}
        <AnimatePresence>
          {!collapsed && !reducedMotion && (
            <motion.svg
              key="ring"
              className="absolute"
              width={RADIUS * 2 + 8}
              height={RADIUS * 2 + 8}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: failed ? 0.9 : 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              aria-hidden
            >
              <circle
                cx={RADIUS + 4}
                cy={RADIUS + 4}
                r={RADIUS}
                fill="none"
                stroke={ringColor}
                strokeOpacity={settled ? 0.55 : 0.35}
                strokeWidth="1.5"
                strokeDasharray="2 8"
                strokeLinecap="round"
              />
            </motion.svg>
          )}
        </AnimatePresence>

        {/* Hub */}
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              key="hub"
              className="absolute rounded-full"
              style={{ background: ringColor, width: 5, height: 5 }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 0.75, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.3 }}
              aria-hidden
            />
          )}
        </AnimatePresence>

        {/* Rotating group — transform-origin is the hub, so a plain rotate
            sweeps every tile around the circle. */}
        <motion.div
          className="absolute"
          style={{ width: 0, height: 0 }}
          animate={groupAnimate}
          transition={groupTransition}
        >
          {digits.map((d, i) => {
            const theta = (-90 + (360 / n) * i) * (Math.PI / 180);
            const orbitX = Math.cos(theta) * RADIUS;
            const orbitY = Math.sin(theta) * RADIUS;
            const rowX = metrics.xs[i] ?? 0;

            return (
              <motion.span
                key={i}
                className="absolute flex items-center justify-center rounded-xl border font-black"
                style={{
                  width: metrics.w,
                  height: metrics.h,
                  marginLeft: -metrics.w / 2,
                  marginTop: -metrics.h / 2,
                  fontSize: 22,
                  color: settled ? '#16A34A' : tileText,
                  background: settled ? 'rgba(34,197,94,0.10)' : tileBg,
                  borderColor: settled ? 'rgba(34,197,94,0.55)' : `${ringColor}66`,
                  boxShadow: settled ? '0 0 0 1px rgba(34,197,94,0.18)' : 'none',
                }}
                initial={{ x: rowX, y: 0, rotate: 0, opacity: 1, scale: 1 }}
                animate={
                  collapsed
                    ? { x: 0, y: 0, rotate: -SETTLE, scale: 0.35, opacity: 0 }
                    : failed
                      ? { x: rowX, y: 0, rotate: 0, scale: 1, opacity: 1 }
                      : {
                          x: reducedMotion ? rowX : orbitX,
                          y: reducedMotion ? 0 : orbitY,
                          // Counter-rotate only once settled, so digits visibly
                          // tumble during the spin and land upright.
                          rotate: settled ? -SETTLE : 0,
                          scale: 1,
                          opacity: 1,
                        }
                }
                transition={
                  collapsed
                    ? { duration: 0.42, ease: [0.5, 0, 0.75, 0], delay: i * 0.03 }
                    : settled
                      ? { duration: 0.55, ease: [0.16, 1, 0.3, 1] }
                      : { type: 'spring', stiffness: 260, damping: 24, delay: i * 0.035 }
                }
              >
                {d || '·'}
              </motion.span>
            );
          })}
        </motion.div>

        {/* Verified tile — only ever rendered on a real success. */}
        <AnimatePresence>
          {collapsed && (
            <motion.div
              key="verified"
              className="absolute flex flex-col items-center"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 18 }}
              onAnimationComplete={() => onSuccessComplete?.()}
            >
              <motion.span
                className="flex items-center justify-center rounded-2xl"
                style={{
                  width: 62,
                  height: 62,
                  background: 'rgba(34,197,94,0.12)',
                  border: '1.5px solid rgba(34,197,94,0.6)',
                }}
                animate={reducedMotion ? {} : { boxShadow: [
                  '0 0 0 0 rgba(34,197,94,0.35)',
                  '0 0 0 14px rgba(34,197,94,0)',
                ] }}
                transition={{ duration: 1.1, repeat: Infinity }}
              >
                <Check size={28} strokeWidth={3} color="#16A34A" />
              </motion.span>
              <span
                className="mt-3 flex items-center gap-1.5 text-[12px] font-bold"
                style={{ color: tone === 'dark' ? 'rgba(255,255,255,0.7)' : '#475569' }}
              >
                <Lock size={11} strokeWidth={2.6} /> {successLabel}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
