/**
 * Corner radii — the design system's (shared/tailwind.preset.js):
 *   chip 6 · controls 10 · cards 14 · sheets 20; full only for avatars and toggles.
 */

export const radius = {
  none: 0,
  /** `rounded-chip` — chips and small tags. */
  small: 6,
  /** `rounded-btn` — buttons and inputs. */
  button: 10,
  /** `rounded-card` — cards and tiles. */
  medium: 14,
  /** Cards (older name, same value). */
  large: 14,
  /** `rounded-sheet` — bottom sheets and large surfaces. */
  extraLarge: 20,
  pill: 999,
} as const;

export type RadiusKey = keyof typeof radius;
