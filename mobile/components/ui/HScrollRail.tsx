/**
 * HScrollRail — a horizontal, snapping row of fixed-width tiles.
 * ----------------------------------------------------------------------------
 * The website's coverage carousel under every service card
 * (`client/src/components/home/LiveServices.jsx`):
 *
 *   <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 py-3.5 snap-x">
 *     …tiles…
 *   </div>
 *   <div className="absolute inset-y-0 left-0  w-4  bg-gradient-to-r  from-white" />
 *   <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l  from-white" />
 *
 * ── THE COLLAPSING-TILE BUG THIS EXISTS TO PREVENT ─────────────────────────
 * The web version originally sized tiles with
 * `calc((100% - 5 * 0.75rem) / 6)` — "six across". Inside an overflow-x row a
 * percentage resolves against the VISIBLE width, not the scrollable content
 * width, so every tile became a sixth of the phone screen (~55px) and
 * "Battery & Power" rendered as "BAT & POW" over two clipped lines.
 *
 * React Native has the same trap: a `width: '100%'` child inside a horizontal
 * ScrollView measures against the viewport. So this component does not merely
 * ask callers to avoid percentages — it makes them impossible. `itemWidth` is
 * REQUIRED, and every child is wrapped in a fixed-width cell that the rail
 * owns. A child styled `width: '100%'` now resolves against that fixed cell
 * and comes out correct instead of collapsing.
 *
 * ── WHY react-native-svg FOR THE FADES ─────────────────────────────────────
 * `expo-linear-gradient` is not installed and adding it is a new NATIVE
 * module (Pod install + native rebuild), which this phase may not do.
 * `react-native-svg` is already installed and linked, and `Gradient.tsx`
 * already takes this exact approach.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useCallback, useId, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { spacing, screenPadding } from '../../theme/spacing';

/** `w-4` and `w-10` on the website. */
const FADE_LEFT_WIDTH = 16;
const FADE_RIGHT_WIDTH = 40;

export interface HScrollRailProps {
  children: React.ReactNode;
  /**
   * Explicit width of every cell, in points. REQUIRED — a percentage here is
   * the collapsing-tile bug described above.
   */
  itemWidth: number;
  /** Space between cells. `gap-2.5` on the website. */
  gap?: number;
  /** Horizontal inset, so the first and last tile clear the page gutter. */
  contentPadding?: number;
  /** Vertical breathing room inside the rail. `py-3.5` on the website. */
  verticalPadding?: number;
  /** Snap each cell to the leading edge. */
  snap?: boolean;
  /** Edge fades hinting the row continues rather than ending. */
  fade?: boolean;
  /**
   * The colour the fade blends into. MUST match the surface behind the rail —
   * a white fade over a grey section reads as a smear, not a fade.
   */
  fadeColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function HScrollRailBase({
  children,
  itemWidth,
  gap = 10,
  contentPadding = screenPadding,
  verticalPadding = spacing.md,
  snap = true,
  fade = true,
  fadeColor = colors.surface,
  style,
  testID,
}: HScrollRailProps) {
  // SVG needs a concrete height; measure the rail once.
  const [height, setHeight] = useState(0);
  // Fades are shown only on the side there is actually more content on, so the
  // first tile is not dimmed at rest.
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  // Unique per instance — two rails on one screen would otherwise collide on
  // the SVG gradient id and both render the first one's colours.
  const gradientId = useId().replace(/:/g, '');

  const cells = React.Children.toArray(children).filter(Boolean);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    setHeight((prev) => (prev === next ? prev : next));
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const x = contentOffset.x;
    const maxX = contentSize.width - layoutMeasurement.width;
    // Guard the setState so a scroll frame that changes nothing does not
    // re-render the whole rail 60 times a second.
    const nextAtStart = x <= 1;
    const nextAtEnd = x >= maxX - 1;
    setAtStart((prev) => (prev === nextAtStart ? prev : nextAtStart));
    setAtEnd((prev) => (prev === nextAtEnd ? prev : nextAtEnd));
  }, []);

  const stride = itemWidth + gap;
  const snapOffsets = snap ? cells.map((_, i) => i * stride) : undefined;

  return (
    <View style={[styles.root, style]} onLayout={onLayout} testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate={snap ? 'fast' : 'normal'}
        snapToOffsets={snapOffsets}
        snapToAlignment="start"
        onScroll={fade ? onScroll : undefined}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: contentPadding,
          paddingVertical: verticalPadding,
          gap,
        }}
      >
        {cells.map((child, i) => (
          // The rail owns the width. See the docblock.
          <View key={i} style={{ width: itemWidth }}>
            {child}
          </View>
        ))}
      </ScrollView>

      {fade && height > 0 ? (
        <>
          {!atStart ? (
            <EdgeFade
              id={`${gradientId}-l`}
              width={FADE_LEFT_WIDTH}
              height={height}
              color={fadeColor}
              side="left"
            />
          ) : null}
          {!atEnd ? (
            <EdgeFade
              id={`${gradientId}-r`}
              width={FADE_RIGHT_WIDTH}
              height={height}
              color={fadeColor}
              side="right"
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function EdgeFade({
  id,
  width,
  height,
  color,
  side,
}: {
  id: string;
  width: number;
  height: number;
  color: string;
  side: 'left' | 'right';
}) {
  return (
    <View
      pointerEvents="none"
      style={[styles.fade, side === 'left' ? { left: 0 } : { right: 0 }, { width }]}
    >
      <Svg width={width} height={height}>
        <Defs>
          {/* Opaque at the outer edge, transparent inwards. */}
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={side === 'left' ? 1 : 0} />
            <Stop offset="1" stopColor={color} stopOpacity={side === 'left' ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export const HScrollRail = memo(HScrollRailBase);

const styles = StyleSheet.create({
  root: {
    position: 'relative',
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});
