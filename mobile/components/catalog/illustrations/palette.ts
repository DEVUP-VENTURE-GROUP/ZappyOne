/**
 * Illustration inks — the four colours every Zappy drawing is built from.
 * ----------------------------------------------------------------------------
 * Port of the website's `themeVars()` in `constants/catalogCategories.js`,
 * which sets four CSS custom properties on a catalog surface:
 *
 *     --ill-ink   theme.deep     structure, wheels, outlines
 *     --ill-body  theme.accent   the subject's main mass
 *     --ill-tint  theme.soft     secondary mass / props
 *     --ill-pale  theme.tint     highlights and glass
 *
 * That indirection is the whole trick: ONE drawing reads blue on Car Services,
 * teal on Cleaning and violet on Phone Repair without a second asset. React
 * Native has no cascading custom properties, so the same four values are passed
 * down explicitly as an `Inks` object instead.
 *
 * The amber spotlight is deliberately NOT themeable — it is the one fixed warm
 * note across the whole set.
 * ----------------------------------------------------------------------------
 */

/** The four themeable inks handed to every drawing. */
export interface Inks {
  ink: string;
  body: string;
  tint: string;
  pale: string;
}

interface Palette {
  accent: string;
  deep: string;
  tint: string;
  soft: string;
}

/** `THEMES` in the website's catalogCategories.js, verbatim. */
export const PALETTES = {
  blue: { accent: '#2563EB', deep: '#1E3A8A', tint: '#EFF6FF', soft: '#DBEAFE' },
  teal: { accent: '#0E9488', deep: '#134E4A', tint: '#F0FDFA', soft: '#CCFBF1' },
  violet: { accent: '#6D4DF6', deep: '#3B1E8F', tint: '#F5F3FF', soft: '#EDE9FE' },
  amber: { accent: '#D97706', deep: '#7C2D12', tint: '#FFFBEB', soft: '#FEF3C7' },
  green: { accent: '#16A34A', deep: '#14532D', tint: '#F0FDF4', soft: '#DCFCE7' },
  rose: { accent: '#E11D48', deep: '#881337', tint: '#FFF1F2', soft: '#FFE4E6' },
  cyan: { accent: '#0891B2', deep: '#164E63', tint: '#ECFEFF', soft: '#CFFAFE' },
  slate: { accent: '#334155', deep: '#0F172A', tint: '#F8FAFC', soft: '#E2E8F0' },
} as const satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;

/**
 * Which palette each catalog category wears, and the drawing it falls back to.
 * Read straight off the website's `CONFIG` map so the two cannot disagree.
 */
export const CATEGORY_THEME: Record<
  string,
  { palette: PaletteName; illustration: string }
> = {
  car: { palette: 'blue', illustration: 'periodic-service' },
  bike: { palette: 'green', illustration: 'bike' },
  mobile: { palette: 'violet', illustration: 'phone' },
  laptop: { palette: 'slate', illustration: 'laptop' },
  smart: { palette: 'cyan', illustration: 'smart-home' },
  appliance: { palette: 'amber', illustration: 'appliance' },
  electrical: { palette: 'amber', illustration: 'electrical' },
  plumbing: { palette: 'cyan', illustration: 'plumbing' },
  carpentry: { palette: 'amber', illustration: 'carpentry' },
  cleaning: { palette: 'teal', illustration: 'cleaning' },
  family: { palette: 'rose', illustration: 'helper' },
  event: { palette: 'violet', illustration: 'event' },
  pet: { palette: 'amber', illustration: 'pet' },
  commercial: { palette: 'slate', illustration: 'fleet' },
  other_services: { palette: 'slate', illustration: 'tools' },
};

/** The website's `ALL_CATEGORY` default — blue, drawing `tools`. */
export const DEFAULT_THEME = { palette: 'blue' as PaletteName, illustration: 'tools' };

/** Turn a palette into the four inks a drawing consumes. */
export function inksFor(palette: PaletteName = 'blue'): Inks {
  const p = PALETTES[palette] ?? PALETTES.blue;
  return { ink: p.deep, body: p.accent, tint: p.soft, pale: p.tint };
}

/** Inks for a catalog category key, falling back to the site's blue default. */
export function inksForCategory(categoryKey?: string | null): Inks {
  return inksFor((categoryKey && CATEGORY_THEME[categoryKey]?.palette) || DEFAULT_THEME.palette);
}

/**
 * White-on-colour inks, for drawings sitting on a saturated surface.
 * Mirrors the override `FeaturedBanner.jsx` applies to its hero illustration.
 */
export const ON_COLOR_INKS: Inks = {
  ink: 'rgba(255,255,255,0.55)',
  body: '#FFFFFF',
  tint: 'rgba(255,255,255,0.30)',
  pale: 'rgba(255,255,255,0.75)',
};
