/**
 * Zappy mobile design system.
 *
 * Single import surface: `import { colors, spacing, radius } from '@/theme'`.
 * Every value traces back to the website — see the individual token files for
 * the specific CSS class or Tailwind key each one came from.
 */

export {
  colors, gradients, statusColors,
  // `indigo`/`violet` are the current brand ramps; `zappy` is the legacy blue,
  // still exported on purpose. See the note at the top of ./colors.
  indigo, violet, zappy,
  navy, success, accent, danger, slate,
} from './colors';
export type { StatusColorKey } from './colors';

export { typography, fontFamily } from './typography';
export type { TypographyVariant, FontFamilyKey, TextStyleToken } from './typography';

export { spacing, screenPadding, bottomNavClearance, minTouchTarget } from './spacing';
export type { SpacingKey } from './spacing';

export { radius } from './radius';
export type { RadiusKey } from './radius';

export { shadows } from './shadows';
export type { ShadowKey } from './shadows';

export {
  easeSoft,
  easeStandard,
  duration,
  timing,
  pressScale,
  springSnap,
} from './animation';

export { breakpoints, sizes, useLayout } from './dimensions';
export type { LayoutInfo } from './dimensions';

/** Font files, registered by `useFonts` in the root layout. */
export const fontAssets = {
  'Poppins-Regular': require('../assets/fonts/Poppins-Regular.ttf'),
  'Poppins-Medium': require('../assets/fonts/Poppins-Medium.ttf'),
  'Poppins-SemiBold': require('../assets/fonts/Poppins-SemiBold.ttf'),
  'Poppins-Bold': require('../assets/fonts/Poppins-Bold.ttf'),
  'Poppins-ExtraBold': require('../assets/fonts/Poppins-ExtraBold.ttf'),
  // 900. The website loads Poppins 300–900 and leans on Black for its punchiest
  // headings — section titles, price figures, and almost every heading on the
  // worker surface. Without it those rendered a weight lighter than the web.
  'Poppins-Black': require('../assets/fonts/Poppins-Black.ttf'),
} as const;
