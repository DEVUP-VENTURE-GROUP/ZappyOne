/* ─── Zappy Premium Animation System ──────────────────────────────────────
   60fps GPU-accelerated, spring-physics-based motion tokens.
   Used across every page for a consistent cinematic feel.
─────────────────────────────────────────────────────────────────────────── */

// ── prefers-reduced-motion ────────────────────────────────────────────────
// Users with vestibular disorders, epilepsy, or low-memory devices (#67)
// opt into reduced motion via OS settings. We respect it platform-wide.
//
// Usage in components:
//   import { reducedMotion } from './animations';
//   <motion.div animate={reducedMotion ? {} : { y: [-6,6,-6] }} />
//
// For framer-motion variants, use the `reduceVariant` helper below which
// strips infinite repeats and replaces them with a single opacity fade.
export const reducedMotion =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

// Strips `repeat: Infinity` from a transition so it plays once and stops.
// Use this to wrap any animation object that has an infinite loop.
export function noLoop(animateObj) {
  if (!reducedMotion) return animateObj;
  const { transition, ...rest } = animateObj?.animate ?? animateObj ?? {};
  const safeTransition = transition
    ? { ...transition, repeat: 0, duration: Math.min(transition.duration ?? 0.3, 0.3) }
    : { duration: 0 };
  if (animateObj?.animate !== undefined) {
    return { ...animateObj, animate: { ...rest, transition: safeTransition } };
  }
  return { ...rest, transition: safeTransition };
}

// ─── Easing curves ────────────────────────────────────────────────────────
export const ease = [0.25, 0.46, 0.45, 0.94];
export const easeSnap  = [0.34, 1.56, 0.64, 1];   // overshoot spring feel
export const easeSoft  = [0.16, 1, 0.3, 1];         // smooth deceleration
export const easeSharp = [0.4, 0, 0.2, 1];          // material-like

// ─── Spring configs ───────────────────────────────────────────────────────
export const spring     = { type: 'spring', stiffness: 380, damping: 30 };
export const springSnap = { type: 'spring', stiffness: 500, damping: 28 };
export const springLazy = { type: 'spring', stiffness: 200, damping: 24 };
export const springBouncy = { type: 'spring', stiffness: 600, damping: 22, mass: 0.8 };

// ─── Page transitions ─────────────────────────────────────────────────────
export const pageVariants = reducedMotion
  ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
  : {
      // Premium "reveal": the new page rises + scales in quickly; the old page
      // drops away near-instantly so AnimatePresence's wait barely delays it.
      initial: { opacity: 0, y: 12, scale: 0.985 },
      animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.26, ease: easeSoft } },
      exit:    { opacity: 0, y: -6, scale: 0.992, transition: { duration: 0.12, ease: 'easeIn' } },
    };
export const pageTransition = reducedMotion
  ? { duration: 0.15, ease: 'linear' }
  : { duration: 0.26, ease: easeSoft };

// ─── Stagger containers ───────────────────────────────────────────────────
export const staggerContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.07, delayChildren: 0.06 } },
};
export const staggerFast = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};
export const staggerSlow = {
  initial: {},
  animate: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

// ─── Item animations ──────────────────────────────────────────────────────
export const fadeInUp = {
  initial:  { opacity: 0, y: 20 },
  animate:  { opacity: 1, y: 0, transition: { duration: 0.32, ease: easeSoft } },
};
export const fadeInDown = {
  initial:  { opacity: 0, y: -16 },
  animate:  { opacity: 1, y: 0, transition: { duration: 0.28, ease: easeSoft } },
};
export const fadeIn = {
  initial:  { opacity: 0 },
  animate:  { opacity: 1, transition: { duration: 0.24, ease } },
};
export const scaleIn = {
  initial:  { opacity: 0, scale: 0.9 },
  animate:  { opacity: 1, scale: 1, transition: { duration: 0.28, ease: easeSnap } },
};
export const scaleInBounce = {
  initial:  { opacity: 0, scale: 0.7 },
  animate:  { opacity: 1, scale: 1, transition: springBouncy },
};
export const slideInRight = {
  initial:  { opacity: 0, x: 28 },
  animate:  { opacity: 1, x: 0, transition: { duration: 0.3, ease: easeSoft } },
};
export const slideInLeft = {
  initial:  { opacity: 0, x: -28 },
  animate:  { opacity: 1, x: 0, transition: { duration: 0.3, ease: easeSoft } },
};
export const slideUp = {
  initial:  { opacity: 0, y: '100%' },
  animate:  { opacity: 1, y: 0, transition: { duration: 0.38, ease: easeSoft } },
  exit:     { opacity: 0, y: '100%', transition: { duration: 0.26, ease: easeSharp } },
};

// ─── Card / hover interactions ────────────────────────────────────────────
export const cardHover = {
  rest:  { y: 0, scale: 1, boxShadow: '0 1px 4px rgba(15,23,42,0.05)' },
  hover: { y: -4, scale: 1.01, boxShadow: '0 16px 40px rgba(15,23,42,0.12)', transition: { duration: 0.22, ease } },
};
export const cardPress = {
  whileHover: { y: -3, scale: 1.01, transition: { duration: 0.2, ease } },
  whileTap:   { scale: 0.97, transition: { duration: 0.1 } },
};
export const buttonTap = {
  whileHover: { scale: 1.03, transition: { duration: 0.15 } },
  whileTap:   { scale: 0.96, transition: { duration: 0.1 } },
};
export const iconPop = {
  whileHover: { scale: 1.2, rotate: 5, transition: springSnap },
  whileTap:   { scale: 0.9, transition: { duration: 0.1 } },
};

// ─── Pulse / glow animation ───────────────────────────────────────────────
// Infinite loops are skipped for users with prefers-reduced-motion. (#67)
export const pulseGlow = {
  animate: {
    boxShadow: [
      '0 0 0 0px rgba(99,102,241,0.4)',
      '0 0 0 10px rgba(99,102,241,0)',
      '0 0 0 0px rgba(99,102,241,0)',
    ],
    transition: reducedMotion
      ? { duration: 0 }
      : { duration: 2, repeat: Infinity, ease: 'easeOut' },
  },
};
export const pulseGreen = {
  animate: {
    boxShadow: [
      '0 0 0 0px rgba(34,197,94,0.5)',
      '0 0 0 10px rgba(34,197,94,0)',
      '0 0 0 0px rgba(34,197,94,0)',
    ],
    transition: reducedMotion
      ? { duration: 0 }
      : { duration: 1.8, repeat: Infinity, ease: 'easeOut' },
  },
};

// ─── Floating animation ───────────────────────────────────────────────────
export const floatY = {
  animate: reducedMotion
    ? {}
    : { y: [-6, 6, -6], transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' } },
};
export const floatX = {
  animate: reducedMotion
    ? {}
    : { x: [-4, 4, -4], transition: { duration: 5, repeat: Infinity, ease: 'easeInOut' } },
};

// ─── Shimmer skeleton ─────────────────────────────────────────────────────
export const shimmer = {
  animate: reducedMotion
    ? { opacity: [1, 0.5, 1], transition: { duration: 1.5, repeat: Infinity } }
    : {
        backgroundPosition: ['200% 0', '-200% 0'],
        transition: { duration: 1.6, repeat: Infinity, ease: 'linear' },
      },
};

// ─── Counter / number roll ────────────────────────────────────────────────
export function counterVariants(from = 0, to = 100) {
  return {
    initial: { opacity: 0, y: 10 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: easeSoft },
    },
  };
}

// ─── Reveal on scroll helper props ────────────────────────────────────────
export const revealProps = {
  initial: 'initial',
  whileInView: 'animate',
  viewport: { once: true, margin: '-40px' },
};
