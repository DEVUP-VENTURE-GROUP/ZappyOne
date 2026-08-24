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

/**
 * Font-family names registered via `useFonts` in the root layout.
 *
 * The mapping mirrors the weights the website actually loads
 * (`client/index.html` requests Poppins 300;400;500;600;700;800;900):
 *
 *   400 → Regular · 500 → Medium · 600 → SemiBold
 *   700 → Bold    · 800 → ExtraBold · 900 → Black
 *
 * React Native picks a face by NAME, not by numeric weight, so every weight the
 * design uses has to exist as its own file. `black` is the one that was missing.
 */
export const fontFamily = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semibold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
  extrabold: 'Poppins-ExtraBold',
  black: 'Poppins-Black',
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

  /**
   * The catalog hero title — `ServicesPage` / category pages.
   * Measured on the live site: 30px/32.4px, weight 900, #0F172A, ls -0.75px.
   * Poppins Black is what gives this its weight; it read a step lighter before
   * the 900 face was bundled.
   */
  pageTitle: {
    fontFamily: fontFamily.black,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.75,
    color: colors.textHeading,
  },

  /**
   * The little tracked label above a hero title — "ZAPPY CATALOG".
   * 10px/15px, weight 900, brand blue, ls 2px, uppercase. Colour is left to the
   * call site because the site tints it per section.
   */
  eyebrow: {
    fontFamily: fontFamily.black,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.primary,
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

  /**
   * The website's content-section header.
   *
   * `HomePage.jsx` → `SectionHeader`: `text-[20px] font-bold text-slate-900
   * tracking-tight`, measured live at 20px/30px, weight 700, #0F172A,
   * letter-spacing -0.5px. This is the heading above every rail and grid on the
   * site — "Popular Services", "Electronics Rescue", "Phone Repair".
   *
   * Distinct from `sectionTitle` (12px uppercase muted), which the website uses
   * ONLY for settings groups on the profile page. Mobile had been rendering all
   * of these as the small grey label, which is the single biggest reason the app
   * read as generic rather than as Zappy.
   */
  sectionHeading: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 30,
    letterSpacing: -0.5,
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
