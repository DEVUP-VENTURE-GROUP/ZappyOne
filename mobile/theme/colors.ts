/**
 * Zappy colour system.
 * ----------------------------------------------------------------------------
 * Ported from `client/tailwind.config.js` and `client/src/styles/index.css`.
 * These are the website's real values — do not "improve" them here, or mobile
 * and web drift apart.
 *
 * The accent is #F59E0B (amber). The mobile app previously used #F97316
 * (orange), which was an accidental divergence — see the Phase 1 audit.
 *
 * ── THE PRIMARY IS INDIGO, NOT `zappy` BLUE ───────────────────────────────
 * `tailwind.config.js` still DEFINES `zappy` (#2563EB) and it is still a real
 * token, but the website stopped painting with it. Counted across
 * `client/src` during the Phase 0 architecture audit:
 *
 *     indigo  1,148 uses        zappy  113 uses
 *     violet    306 uses
 *
 * and in the five verticals the new architecture introduced — pet, repair,
 * helping, shop, provider — `zappy` appears exactly ZERO times while indigo
 * appears 236 times. `LiveServices`, which now backs the whole services
 * catalog, is indigo/violet throughout.
 *
 * So the config is not the source of truth for what the product LOOKS like;
 * the applied classes are. The semantic tokens below therefore resolve to
 * indigo/violet, which is what makes mobile match the current website.
 *
 * `zappy` stays exported, unchanged, immediately below. It is a LEGACY ramp,
 * not a dead one: older and specialised surfaces may still reference it
 * deliberately. What must not happen is a second competing semantic layer —
 * anything structural reads from `colors`, and `colors` is indigo.
 * ----------------------------------------------------------------------------
 */

/**
 * LEGACY brand blue. Retained deliberately — see the note above. Reach for
 * this only when a surface is meant to stay on the older blue; everything
 * structural should use `colors.primary`.
 */
export const zappy = {
  50: '#EFF6FF',
  100: '#DBEAFE',
  200: '#BFDBFE',
  300: '#93C5FD',
  400: '#60A5FA',
  500: '#3B82F6',
  600: '#2563EB', // brand hero
  700: '#1D4ED8',
  800: '#1E40AF',
  900: '#1E3A8A',
} as const;

/**
 * Indigo — the CURRENT primary ramp. Tailwind's default `indigo`, which is
 * what `client/tailwind.config.js` resolves to (it does not override indigo).
 * 600 is the brand hero; 500 opens the signature gradient.
 */
export const indigo = {
  50: '#EEF2FF',
  100: '#E0E7FF',
  200: '#C7D2FE',
  300: '#A5B4FC',
  400: '#818CF8',
  500: '#6366F1',
  600: '#4F46E5', // brand hero
  700: '#4338CA',
  800: '#3730A3',
  900: '#312E81',
} as const;

/**
 * Violet — indigo's gradient partner and the accent on the new vertical
 * surfaces. Tailwind default `violet`, also un-overridden by the website.
 */
export const violet = {
  50: '#F5F3FF',
  100: '#EDE9FE',
  400: '#A78BFA',
  500: '#8B5CF6',
  600: '#7C3AED', // gradient target
  700: '#6D28D9',
} as const;

/** Deep navy — headings and the legacy gradient target. */
export const navy = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
  DEFAULT: '#0F172A',
} as const;

export const success = {
  50: '#F0FDF4',
  100: '#DCFCE7',
  500: '#22C55E',
  600: '#16A34A',
  700: '#15803D',
} as const;

/** Accent amber — #F59E0B, NOT #F97316. */
export const accent = {
  50: '#FFFBEB',
  100: '#FEF3C7',
  500: '#F59E0B',
  600: '#D97706',
  700: '#B45309',
} as const;

export const danger = {
  50: '#FEF2F2',
  100: '#FEE2E2',
  400: '#F87171',
  500: '#EF4444',
  600: '#DC2626',
} as const;

/** Slate neutrals — the website's structural greys. */
export const slate = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
} as const;

/**
 * Semantic tokens — what screens should actually reference. Reaching for a
 * ramp value directly is fine for one-off decorative work, but anything
 * structural belongs here so a palette change lands everywhere at once.
 */
export const colors = {
  // Brand — indigo. See the ramp note at the top of this file for why this is
  // no longer `zappy`. Screens read these names, so the move lands everywhere
  // at once without a single screen edit.
  primary: indigo[600],      // #4F46E5
  /** Pressed / hovered state. `primaryHover` is the same value, named for the
   *  web idiom; both exist so neither call site has to guess. */
  primaryDark: indigo[700],  // #4338CA
  primaryHover: indigo[700], // #4338CA
  primaryLight: indigo[500], // #6366F1
  primaryTint: indigo[50],   // #EEF2FF
  primarySoft: indigo[100],  // #E0E7FF

  // Surfaces — --zappy-bg is #FAFAFB on the website.
  background: '#FAFAFB',
  surface: '#FFFFFF',
  surfaceSecondary: slate[50],
  surfaceTertiary: slate[100],

  // Text — body copy is #111827, headings are navy.
  textPrimary: '#111827',
  textHeading: navy[900],
  textSecondary: slate[500],
  textMuted: slate[400],
  textInverse: '#FFFFFF',

  // Status
  success: success[500],
  successDark: success[600],
  successTint: success[50],
  warning: accent[500],
  warningTint: accent[50],
  error: danger[500],
  errorDark: danger[600],
  errorTint: danger[50],
  info: zappy[600],
  infoTint: zappy[50],

  // Accent
  accent: accent[500],
  accentDark: accent[600],
  accentTint: accent[50],

  // Structure
  border: slate[200],
  borderStrong: slate[300],
  divider: slate[100],
  ring: 'rgba(15, 23, 42, 0.05)',

  // States
  overlay: 'rgba(2, 6, 23, 0.55)',
  disabled: slate[300],
  disabledText: slate[400],

  // Map / tracking pins
  pinCustomer: zappy[600],
  pinWorker: accent[500],
} as const;

/**
 * The signature 135° gradient — now indigo → violet, matching
 * `from-indigo-500 to-violet-600`, the pair the website uses for every hero
 * surface on the new vertical pages.
 */
export const gradients = {
  /** Preferred name. #6366F1 → #7C3AED. */
  brand: [indigo[500], violet[600]] as const,
  /**
   * Kept as an alias of `brand` rather than as the old blue→navy pair.
   *
   * `Gradient` defaults to this key, so every hero card already in the app
   * picks up the new look without a single component edit — which is the
   * whole point of the rename being an alias instead of a replacement.
   */
  zappy: [indigo[500], violet[600]] as const,
  /** The previous blue → navy pair, if a surface deliberately wants it back. */
  legacyBlueNavy: [zappy[600], navy[900]] as const,
  /** expo-linear-gradient / react-native-svg use start/end fractions for 135°. */
  diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
} as const;

/**
 * Order-status colours. Status must never be communicated by colour ALONE —
 * every consumer pairs these with a label, per the accessibility requirement.
 */
export const statusColors = {
  created: { fg: slate[600], bg: slate[100] },
  searching: { fg: accent[700], bg: accent[50] },
  assigned: { fg: zappy[700], bg: zappy[50] },
  on_the_way: { fg: zappy[700], bg: zappy[50] },
  arrived: { fg: zappy[700], bg: zappy[50] },
  in_progress: { fg: zappy[700], bg: zappy[50] },
  completed: { fg: success[700], bg: success[50] },
  cancelled: { fg: danger[600], bg: danger[50] },
  failed: { fg: danger[600], bg: danger[50] },
} as const;

export type StatusColorKey = keyof typeof statusColors;
