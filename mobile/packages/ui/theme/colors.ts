/**
 * ZappyOne colour system — the same tokens as the website.
 * ----------------------------------------------------------------------------
 * Source of truth: shared/tailwind.preset.js. One brand blue taken from the
 * logo (#1F4FD8), the logo's amber for live/location state only, a cool ink
 * scale for text, and surfaces canvas → surface → sunken with hairlines.
 * No gradients and no glow: elevation is borders first, shadow only on what
 * floats (sheets, sticky bars).
 *
 * Screens read the semantic `colors` below; the ramps exist for one-off
 * decorative work. Change a value here and every app follows.
 * ----------------------------------------------------------------------------
 */

/** ZappyOne blue. 600 is the brand. */
export const zappy = {
  50: '#EEF3FD',
  100: '#DCE6FB',
  200: '#B9CCF7',
  300: '#8EAAF0',
  400: '#5B82E6',
  500: '#3463DD',
  600: '#1F4FD8',
  700: '#1A41B4',
  800: '#173891',
  900: '#142F73',
} as const;

/** Older names for the brand ramp, kept so existing components follow the brand. */
export const indigo = zappy;
export const violet = zappy;

/** Text, darkest to faintest. */
export const ink = {
  900: '#101828',
  700: '#344054',
  500: '#5B6474',
  400: '#8A92A0',
  300: '#B4BAC4',
  DEFAULT: '#101828',
} as const;

/** Cool neutrals for structure (borders, wells, disabled). */
export const slate = {
  50: '#F5F6F8', // canvas
  100: '#EEF0F3', // sunken
  200: '#E3E6EB', // line
  300: '#D2D7DE', // line strong
  400: '#8A92A0',
  500: '#5B6474',
  600: '#475467',
  700: '#344054',
  800: '#1D2939',
  900: '#101828',
} as const;

/** Headings. */
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

/** The logo's amber: location and live state only. */
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

/** What screens reference. */
export const colors = {
  primary: zappy[600],
  primaryDark: zappy[700],
  primaryHover: zappy[700],
  primaryLight: zappy[500],
  primaryTint: zappy[50],
  primarySoft: zappy[100],

  // Surfaces: canvas = page, surface = cards, sunken = wells and tiles.
  background: slate[50],
  surface: '#FFFFFF',
  surfaceSecondary: slate[100],
  surfaceTertiary: slate[100],

  textPrimary: ink[900],
  textHeading: ink[900],
  textSecondary: ink[500],
  textMuted: ink[400],
  textInverse: '#FFFFFF',

  success: success[600],
  successDark: success[700],
  successTint: success[50],
  warning: accent[600],
  warningTint: accent[50],
  error: danger[500],
  errorDark: danger[600],
  errorTint: danger[50],
  info: zappy[600],
  infoTint: zappy[50],

  accent: accent[500],
  accentDark: accent[600],
  accentTint: accent[50],

  border: slate[200],
  borderStrong: slate[300],
  divider: slate[100],
  ring: 'rgba(16, 24, 40, 0.05)',

  overlay: 'rgba(16, 24, 40, 0.55)',
  disabled: slate[300],
  disabledText: ink[400],

  pinCustomer: zappy[600],
  pinWorker: accent[500],
} as const;

/**
 * The design system has no gradients. These stay as flat pairs so components
 * built around a gradient render the brand fill.
 */
export const gradients = {
  brand: [zappy[600], zappy[600]] as const,
  zappy: [zappy[600], zappy[600]] as const,
  legacyBlueNavy: [zappy[600], zappy[600]] as const,
  diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
} as const;

/**
 * Status tones. Never colour alone: every badge pairs a tone with its words.
 * `statusColors` is the older name.
 */
export const toneColors = {
  neutral: { fg: ink[700], bg: slate[100] },
  info: { fg: zappy[700], bg: zappy[50] },
  live: { fg: accent[700], bg: accent[50] },
  success: { fg: success[700], bg: success[50] },
  danger: { fg: danger[600], bg: danger[50] },
} as const;
export const statusColors = toneColors;

export type Tone = keyof typeof toneColors;
export type StatusColorKey = Tone;
