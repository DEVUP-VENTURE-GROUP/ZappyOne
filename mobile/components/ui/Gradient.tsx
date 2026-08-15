/**
 * Brand gradient surface.
 * ----------------------------------------------------------------------------
 * Renders the website's signature 135° `#2563EB → #0F172A` gradient.
 *
 * WHY react-native-svg AND NOT expo-linear-gradient:
 * `expo-linear-gradient` is not installed, and adding it is a new NATIVE
 * module — it would force a Pod install and a native rebuild, which Phase 5 is
 * explicitly not allowed to do. `react-native-svg` is already installed
 * (15.15.5) and already linked (`RNSVG` is in `ios/Podfile.lock`), and its
 * `<LinearGradient>` renders the identical result at no dependency cost.
 *
 * The SVG is a single absolutely-positioned rect behind the content — one
 * flat draw call, no per-frame work, so it costs nothing on Android.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { gradients } from '../../theme/colors';

export interface GradientProps {
  children?: React.ReactNode;
  /** Defaults to the Zappy blue → navy pair. */
  colors?: readonly [string, string];
  style?: StyleProp<ViewStyle>;
  /** Border radius applied to the clipping container. */
  borderRadius?: number;
  testID?: string;
}

function GradientBase({
  children,
  colors: colorPair = gradients.zappy,
  style,
  borderRadius = 0,
  testID,
}: GradientProps) {
  // SVG needs concrete pixel dimensions; measure once on layout.
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    // Only update on a real change — layout fires on every re-measure and an
    // unconditional setState here would loop.
    setSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  return (
    <View
      style={[{ borderRadius, overflow: 'hidden' }, style]}
      onLayout={onLayout}
      testID={testID}
    >
      {size.width > 0 && size.height > 0 ? (
        <Svg
          width={size.width}
          height={size.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            {/* x1,y1 → x2,y2 of (0,0)→(1,1) is the 135° diagonal the site uses. */}
            <LinearGradient id="zappyGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colorPair[0]} />
              <Stop offset="1" stopColor={colorPair[1]} />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={size.width}
            height={size.height}
            fill="url(#zappyGradient)"
          />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

export const Gradient = memo(GradientBase);
