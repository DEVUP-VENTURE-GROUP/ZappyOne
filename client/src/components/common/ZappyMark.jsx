import { memo } from 'react';
import { motion } from 'framer-motion';
import { reducedMotion, easeSoft } from '../../lib/animations';

/**
 * Animated Zappy symbol — the dashing "Z" with its speed lines and pin.
 *
 * Why this and not the logo file: `/logo.png` is a raster of the full-colour
 * mark on white. Dropped into the nav's dark blue FAB it would be blue-on-blue,
 * fringed, and impossible to animate per-part. This is the same symbol rebuilt
 * as vector and reduced for small sizes — at ~32px the runner's limbs and the
 * gradient are noise, so the mark keeps only what stays legible and on-brand:
 * the italic Z, the three trailing speed lines, and the orange location pin.
 *
 * Ink is deliberately monochrome (`color`) plus the one orange accent, so the
 * mark reads at full contrast on a saturated background.
 *
 * The motion says what the logo says — forward speed:
 *   • speed lines streak in from behind, staggered
 *   • the Z leans into the run and settles
 *   • the pin drops and bobs, as a location pin should
 * All of it collapses to a static mark under prefers-reduced-motion.
 */


function ZappyMark({ size = 34, color = '#FFFFFF', pin = '#F59E0B', animated = true, className = '' }) {
  const live = animated && !reducedMotion;

  // Trailing speed lines: staggered so they read as one gust, not three ticks.
  const line = (i) =>
    live
      ? {
          animate: { x: [-7, 0, 0, -7], opacity: [0, 1, 1, 0] },
          transition: {
            duration: 1.9,
            times: [0, 0.28, 0.62, 1],
            repeat: Infinity,
            repeatDelay: 0.5,
            delay: i * 0.11,
            ease: easeSoft,
          },
        }
      : {};

  return (
    <motion.svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Zappy"
      focusable="false"
      // The whole mark surges forward a touch on each cycle.
      animate={live ? { x: [0, 1.6, 0] } : {}}
      transition={live ? { duration: 1.9, repeat: Infinity, repeatDelay: 0.5, ease: easeSoft } : {}}
    >
      {/* Speed lines */}
      <g stroke={color} strokeWidth="4.6" strokeLinecap="round" opacity="0.9">
        <motion.line x1="5" y1="20" x2="16" y2="20" {...line(0)} />
        <motion.line x1="2" y1="30" x2="18" y2="30" {...line(1)} />
        <motion.line x1="6" y1="40" x2="14" y2="40" {...line(2)} />
      </g>

      {/* The Z — skewed into an italic so it leans into the run.
          The static skew/translate lives on this OUTER <g> as an SVG attribute; the
          rotate animates on the INNER <motion.g>. Keeping them on separate elements
          means framer's animated CSS transform (rotate) no longer overrides the SVG
          transform attribute — so the italic lean survives while animating, not only
          in reduced-motion. */}
      <g transform="skewX(-8) translate(3 -1)">
        <motion.g
          stroke={color}
          strokeWidth="8.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          animate={live ? { rotate: [0, -2.5, 0] } : {}}
          transition={live ? { duration: 1.9, repeat: Infinity, repeatDelay: 0.5, ease: easeSoft } : {}}
          style={{ transformOrigin: '32px 32px' }}
        >
          <path d="M24 16H46" />
          <path d="M46 16 27 41" />
          <path d="M27 41H49" />
        </motion.g>
      </g>

      {/* Location pin — the one accent colour, so it stays the eye's anchor */}
      <motion.g
        animate={live ? { y: [0, -2.2, 0] } : {}}
        transition={live ? { duration: 1.9, repeat: Infinity, repeatDelay: 0.5, ease: easeSoft, delay: 0.14 } : {}}
      >
        <path
          d="M51 35.4a6.3 6.3 0 0 1 6.3 6.3c0 4.6-6.3 10.6-6.3 10.6s-6.3-6-6.3-10.6a6.3 6.3 0 0 1 6.3-6.3Z"
          fill={pin}
        />
        <circle cx="51" cy="41.7" r="2.4" fill="#FFFFFF" />
      </motion.g>
    </motion.svg>
  );
}

export default memo(ZappyMark);
