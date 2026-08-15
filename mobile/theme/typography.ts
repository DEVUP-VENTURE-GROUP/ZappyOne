/**
 * Typography.
 * ----------------------------------------------------------------------------
 * Sizes mirror the website's `.h-display` / `.h-section` / `.t-body` classes
 * and the `fontSize` scale in `client/tailwind.config.js`.
 *
 * The website's responsive bumps (`text-xl sm:text-2xl`) collapse to the
 * SMALLER value here — a phone is the small breakpoint. Where the website used
 * a desktop-only size, the mobile equivalent is noted.
 *
 * Poppins is bundled as static TTFs in `assets/fonts` rather than pulled from a
 * font package, so no new dependency was introduced.
 * ----------------------------------------------------------------------------
 */

import { colors } from './colors';

/** Font-family names registered via `useFonts` in the root layout. */
export const fontFamily = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semibold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
  extrabold: 'Poppins-ExtraBold',
} as const;

export type FontFamilyKey = keyof typeof fontFamily;

export interface TextStyleToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  color?: string;
  textTransform?: 'uppercase';
}

/**
 * Named text styles. `Text`/`Heading` accept these by key, so screens never
 * hand-roll a fontSize.
 */
export const typography = {
  /** `.h-display` — 32/40 bold, tracking-tight. Page hero. */
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: colors.textHeading,
  },

  /** Website `h1` scale — 28/36. Screen titles. */
  heading1: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: -0.3,
    color: colors.textHeading,
  },

  /** `.h-section` — 20/28 semibold. Section headers. */
  heading2: {
    fontFamily: fontFamily.semibold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
    color: colors.textHeading,
  },

  /** `.h-card` — 18/26 semibold. Card titles. */
  heading3: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.1,
    color: colors.textHeading,
  },

  /** Website `body` — 16/24. */
  bodyLarge: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
  },

  /** `.t-body` — 15/24. The default reading size. */
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },

  /** `.t-small` — 13/20 slate-500. */
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  /** `.t-muted` — 14 slate-500. */
  muted: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  /** Fine print. */
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },

  /** `.btn` — 15px bold, tracking-wide. */
  button: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.2,
  },

  buttonSmall: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
  },

  /** `.t-label` / `.input-label` — 11px semibold uppercase, wide tracking. */
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  /** `.section-title` — 12px semibold uppercase slate-400. */
  sectionTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  /** Chips and badges — 12px semibold. */
  chip: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    lineHeight: 16,
  },

  /** Bottom-nav labels — 10px semibold, matching `.bottom-nav-item`. */
  navLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
} as const satisfies Record<string, TextStyleToken>;

export type TypographyVariant = keyof typeof typography;
