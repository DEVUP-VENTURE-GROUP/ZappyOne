/**
 * Corner radii — from `client/tailwind.config.js` borderRadius.
 *   btn: 14 · card: 16 · card-lg: 24 · card-xl: 32
 * The website's `.card` uses the 24px value, which is the one that gives Zappy
 * its recognisably soft card silhouette.
 */

export const radius = {
  none: 0,
  small: 8,
  /** `rounded-btn` — buttons and inputs. */
  button: 14,
  /** `rounded-card` — compact cards, tiles, hero. */
  medium: 16,
  /** `rounded-card-lg` — the standard `.card` radius. */
  large: 24,
  /** `rounded-card-xl` — sheets and large surfaces. */
  extraLarge: 32,
  pill: 999,
} as const;

export type RadiusKey = keyof typeof radius;
