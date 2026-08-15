/**
 * Zappy brand mark.
 * ----------------------------------------------------------------------------
 * A vector rebuild of the website's `ZappyMark`: three trailing speed lines,
 * the italic Z leaning into the run, and the amber location pin. Same geometry
 * and same colours as `client/src/components/common/ZappyMark.jsx`.
 *
 * Vector rather than the raster `logo.png` for the same reason the web gives:
 * the PNG is a full-colour mark on white, so on a saturated blue surface it
 * would be blue-on-blue and fringed. The raster is still bundled at
 * `assets/images/zappy-logo.png` for the splash/icon surfaces that want it.
 *
 * Static by default. The website animates the mark, but a looping animation on
 * a persistent header element burns frames continuously on mid-range Android
 * for no functional gain — so motion is opt-in via `animated`.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect } from 'react';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { accent } from '../../theme/colors';
import { easeSoft } from '../../theme/animation';

export interface ZappyLogoProps {
  size?: number;
  /** Ink colour for the Z and speed lines. */
  color?: string;
  /** The one accent — the location pin. */
  pinColor?: string;
  /** Opt in to the forward-surge motion. Off by default. */
  animated?: boolean;
}

function ZappyLogoBase({
  size = 34,
  color = '#FFFFFF',
  pinColor = accent[500],
  animated = false,
}: ZappyLogoProps) {
  const translateX = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const live = animated && !reducedMotion;

  useEffect(() => {
    if (!live) {
      translateX.value = 0;
      return;
    }
    translateX.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 950, easing: easeSoft }),
        withTiming(0, { duration: 950, easing: easeSoft }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(translateX);
  }, [live, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={animatedStyle} accessibilityRole="image" accessibilityLabel="Zappy">
      <Svg viewBox="0 0 64 64" width={size} height={size}>
        {/* Speed lines */}
        <G stroke={color} strokeWidth={4.6} strokeLinecap="round" opacity={0.9}>
          <Line x1="5" y1="20" x2="16" y2="20" />
          <Line x1="2" y1="30" x2="18" y2="30" />
          <Line x1="6" y1="40" x2="14" y2="40" />
        </G>

        {/* The Z, skewed into an italic so it leans into the run */}
        <G transform="skewX(-8) translate(3 -1)">
          <G
            stroke={color}
            strokeWidth={8.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            <Path d="M24 16H46" />
            <Path d="M46 16 27 41" />
            <Path d="M27 41H49" />
          </G>
        </G>

        {/* Location pin — the single accent, and the eye's anchor */}
        <G>
          <Path
            d="M51 35.4a6.3 6.3 0 0 1 6.3 6.3c0 4.6-6.3 10.6-6.3 10.6s-6.3-6-6.3-10.6a6.3 6.3 0 0 1 6.3-6.3Z"
            fill={pinColor}
          />
          <Circle cx="51" cy="41.7" r="2.4" fill="#FFFFFF" />
        </G>
      </Svg>
    </Animated.View>
  );
}

export const ZappyLogo = memo(ZappyLogoBase);
