/**
 * Zappy colour system.
 * ----------------------------------------------------------------------------
 * Ported verbatim from `client/tailwind.config.js` and `client/src/styles/
 * index.css`. These are the website's real values — do not "improve" them here,
 * or mobile and web drift apart.
 *
 * The accent is #F59E0B (amber). The mobile app previously used #F97316
 * (orange), which was an accidental divergence — see the Phase 1 audit.
 * ----------------------------------------------------------------------------
 */

/** Primary blue ramp. 600 is the brand hero. */
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

/** Deep navy — headings and the gradient target. */
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
  // Brand
  primary: zappy[600],
  primaryDark: zappy[700],
  primaryLight: zappy[500],
  primaryTint: zappy[50],
  primarySoft: zappy[100],

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

/** The signature 135° blue → navy gradient. */
export const gradients = {
  zappy: [zappy[600], navy[900]] as const,
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
