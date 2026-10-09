/**
 * Spacing — the website's 8px grid (with 4px half-steps for tight work).
 * Screens should reference these rather than typing raw numbers.
 */

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
  giant: 64,
} as const;

export type SpacingKey = keyof typeof spacing;

/** Horizontal page gutter. The website uses px-4 → px-6; phones take 20. */
export const screenPadding = spacing.lg;

/**
 * Bottom padding a scroll view needs so its last item clears the floating
 * bottom nav. The nav is a ~64pt pill sitting 16pt off the bottom, plus the
 * safe-area inset the caller adds.
 */
export const bottomNavClearance = 96;

/** WCAG 2.5.5 / Apple HIG minimum interactive target. */
export const minTouchTarget = 44;
