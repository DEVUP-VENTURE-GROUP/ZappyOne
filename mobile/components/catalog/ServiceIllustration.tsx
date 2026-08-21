/**
 * ServiceIllustration — the Zappy drawing for a service or category.
 * ----------------------------------------------------------------------------
 * Native counterpart of `client/src/components/catalog/ServiceIllustration.jsx`.
 * Same 64×64 viewBox, same warm spotlight, same 54 drawings, same resolver.
 *
 * The web reads its four inks from CSS custom properties set by an ancestor
 * (`themeVars()`). React Native has no cascade, so the palette is resolved here
 * from the category key and passed into the drawing — see `illustrations/palette`.
 *
 * ── DECORATIVE BY DEFAULT ──────────────────────────────────────────────────
 * The web SVG is `aria-hidden` unless given a title, because the service name
 * sits right next to it and would otherwise be announced twice. Same here.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { DRAWINGS } from './illustrations/drawings';
import {
  ON_COLOR_INKS,
  inksForCategory,
  type Inks,
} from './illustrations/palette';

/** The one warm note in the set — never themed. */
const WARM = '#F59E0B';

/** The cone behind every subject: two stacked translucent triangles. */
function Spotlight() {
  return (
    <G>
      <Path d="M32 2 60 46H4Z" fill={WARM} opacity="0.10" />
      <Path d="M32 6 51 46H13Z" fill={WARM} opacity="0.13" />
    </G>
  );
}

export interface ServiceIllustrationProps {
  /** Drawing key — use `illustrationFor()` to derive it from a service. */
  name: string;
  size?: number;
  /** Catalog category key; picks the palette. */
  categoryKey?: string | null;
  /** Override the palette outright — e.g. white-on-colour inside a hero. */
  inks?: Inks;
  /** True to draw on a saturated surface, using the white-ink override. */
  onColor?: boolean;
  /**
   * Warm cone behind the subject. On for tiles; off when the drawing already
   * sits on a coloured surface, where it muddies.
   */
  spotlight?: boolean;
  /** Supply only when the drawing is the sole label for the thing. */
  title?: string;
}

function ServiceIllustrationBase({
  name,
  size = 44,
  categoryKey,
  inks,
  onColor = false,
  spotlight = true,
  title,
}: ServiceIllustrationProps) {
  const draw = DRAWINGS[name] ?? DRAWINGS.tools;
  const palette = inks ?? (onColor ? ON_COLOR_INKS : inksForCategory(categoryKey));

  return (
    // The a11y props live on a View, not on <Svg>. react-native-svg forwards
    // unknown props straight through, so putting `accessibilityElementsHidden`
    // / `importantForAccessibility` on the Svg reaches the DOM verbatim on web
    // and React warns about both. A View is where RN actually handles them.
    <View
      accessibilityRole={title ? 'image' : undefined}
      accessibilityLabel={title}
      // Decorative unless titled — the adjacent service name carries the meaning.
      accessibilityElementsHidden={!title}
      importantForAccessibility={title ? 'yes' : 'no-hide-descendants'}
    >
      <Svg viewBox="0 0 64 64" width={size} height={size}>
        {spotlight ? <Spotlight /> : null}
        {draw(palette)}
      </Svg>
    </View>
  );
}

export const ServiceIllustration = memo(ServiceIllustrationBase);
export default ServiceIllustration;

export { illustrationFor, hasIllustration } from './illustrations/resolve';
export type { MatchableService } from './illustrations/resolve';
