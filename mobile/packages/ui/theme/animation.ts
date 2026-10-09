/**
 * Motion tokens.
 * ----------------------------------------------------------------------------
 * Durations and easings come from the website: `fadeIn 0.28s`, `scaleIn 0.22s`,
 * `slideUp 0.32s`, and the `cubic-bezier(0.23, 1, 0.32, 1)` used on every
 * button and card transition.
 *
 * Everything here is Reanimated-compatible and runs on the UI thread, so it
 * stays smooth on mid-range Android. Nothing loops indefinitely except the
 * skeleton shimmer, which stops as soon as content arrives.
 * ----------------------------------------------------------------------------
 */

import { Easing, type WithTimingConfig } from 'react-native-reanimated';

/** The website's signature easing — a soft, confident settle. */
export const easeSoft = Easing.bezier(0.23, 1, 0.32, 1);

/** Standard material-ish ease for small state changes. */
export const easeStandard = Easing.bezier(0.4, 0, 0.2, 1);

export const duration = {
  /** Press feedback — must feel instant. */
  instant: 120,
  /** `scaleIn` — 0.22s. */
  fast: 220,
  /** `fadeIn` — 0.28s. */
  normal: 280,
  /** `slideUp` — 0.32s. */
  slow: 320,
  /** Sheets and larger surfaces. */
  sheet: 340,
} as const;

export const timing = {
  instant: { duration: duration.instant, easing: easeStandard } satisfies WithTimingConfig,
  fast: { duration: duration.fast, easing: easeSoft } satisfies WithTimingConfig,
  normal: { duration: duration.normal, easing: easeSoft } satisfies WithTimingConfig,
  slow: { duration: duration.slow, easing: easeSoft } satisfies WithTimingConfig,
  sheet: { duration: duration.sheet, easing: easeSoft } satisfies WithTimingConfig,
} as const;

/**
 * Press scale. The website uses `active:scale-[0.96]` on buttons and
 * `active:scale-[0.99]` on cards — a card is bigger, so it needs less travel
 * to read as pressed.
 */
export const pressScale = {
  button: 0.96,
  card: 0.98,
  tile: 0.94,
} as const;

/** Spring for gestural surfaces (bottom sheets). Damped to avoid overshoot wobble. */
export const springSnap = {
  damping: 22,
  stiffness: 240,
  mass: 0.9,
} as const;
