import {
  Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold,
  Figtree_700Bold, Figtree_800ExtraBold, Figtree_900Black,
} from '@expo-google-fonts/figtree';
/**
 * Zappy mobile design system.
 *
 * Single import surface: `import { colors, spacing, radius } from './'`.
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
  'Figtree-Regular': Figtree_400Regular,
  'Figtree-Medium': Figtree_500Medium,
  'Figtree-SemiBold': Figtree_600SemiBold,
  'Figtree-Bold': Figtree_700Bold,
  'Figtree-ExtraBold': Figtree_800ExtraBold,
  'Figtree-Black': Figtree_900Black,
} as const;
