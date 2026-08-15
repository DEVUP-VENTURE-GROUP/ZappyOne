/**
 * Elevation.
 * ----------------------------------------------------------------------------
 * Ported from the website's `boxShadow` tokens (`soft`, `soft-lg`, `card`,
 * `glow-blue`, `glow-amber`).
 *
 * PERFORMANCE NOTE — this is the single biggest Android cost in a design
 * system. React Native maps `shadow*` props to a real blur on iOS but IGNORES
 * them on Android, where `elevation` is used instead. Android elevation is
 * cheap but coarse, so each token pairs a faithful iOS shadow with a
 * conservative Android elevation rather than trying to match the blur exactly.
 *
 * Shadows are applied to a handful of container surfaces only — never to list
 * rows, which is what makes long lists janky on mid-range hardware. Use
 * `hairline` (a 1px border) for row separation instead.
 * ----------------------------------------------------------------------------
 */

import { Platform, type ViewStyle } from 'react-native';

function shadow(
  ios: {
    color?: string;
    offsetY: number;
    opacity: number;
    radius: number;
  },
  androidElevation: number,
): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: ios.color ?? '#0F172A',
      shadowOffset: { width: 0, height: ios.offsetY },
      shadowOpacity: ios.opacity,
      shadowRadius: ios.radius,
    },
    android: { elevation: androidElevation },
    default: {},
  }) as ViewStyle;
}

export const shadows = {
  none: {} as ViewStyle,

  /** `shadow-card` — barely-there lift for resting cards. */
  card: shadow({ offsetY: 1, opacity: 0.04, radius: 4 }, 1),

  /** `shadow-soft` — 0 4px 20px -2px rgba(15,23,42,0.05). The default. */
  soft: shadow({ offsetY: 4, opacity: 0.06, radius: 10 }, 2),

  /** `shadow-soft-lg` — 0 12px 32px -4px rgba(15,23,42,0.08). Sheets, nav. */
  softLarge: shadow({ offsetY: 8, opacity: 0.1, radius: 16 }, 6),

  /** `shadow-glow-blue` — primary buttons and the hero card. */
  glowBlue: shadow(
    { color: '#2563EB', offsetY: 8, opacity: 0.3, radius: 12 },
    4,
  ),

  /** `shadow-glow-amber` — accent CTAs. */
  glowAmber: shadow(
    { color: '#F59E0B', offsetY: 8, opacity: 0.3, radius: 12 },
    4,
  ),
} as const;

export type ShadowKey = keyof typeof shadows;
