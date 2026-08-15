/**
 * Skeleton loading.
 * ----------------------------------------------------------------------------
 * Reproduces the website's `.skeleton` shimmer (a 1.6s sweep across
 * #F1F5F9 → #E2E8F0). Screens show these instead of a blank view or a bare
 * spinner, which is what makes the app feel fast rather than empty.
 *
 * PERFORMANCE: the shimmer is a single Reanimated opacity loop on the UI
 * thread, not a moving gradient — a translating gradient per row is what makes
 * skeleton lists stutter on mid-range Android. It also honours the reduced-
 * motion setting, matching the website's `prefers-reduced-motion` rule which
 * disables the shimmer entirely.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { easeStandard } from '../../theme/animation';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

function SkeletonBase({
  width = '100%',
  height = 16,
  borderRadius = radius.small,
  style,
}: SkeletonProps) {
  const opacity = useSharedValue(0.55);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 0.75;
      return;
    }
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: easeStandard }),
      -1,
      true,
    );
    // Stop the loop when the skeleton unmounts — a leaked repeat keeps the UI
    // thread busy after the content has loaded.
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: slate[200] },
        animatedStyle,
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export const Skeleton = memo(SkeletonBase);

/** Card-shaped placeholder used by the service and booking lists. */
function SkeletonCardBase({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, style]} accessibilityElementsHidden>
      <View style={styles.row}>
        <Skeleton width={48} height={48} borderRadius={radius.medium} />
        <View style={styles.rowBody}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="45%" height={12} style={{ marginTop: spacing.sm }} />
        </View>
      </View>
    </View>
  );
}

export const SkeletonCard = memo(SkeletonCardBase);

export interface SkeletonListProps {
  count?: number;
}

function SkeletonListBase({ count = 5 }: SkeletonListProps) {
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} style={i > 0 ? { marginTop: spacing.md } : undefined} />
      ))}
    </View>
  );
}

export const SkeletonList = memo(SkeletonListBase);

const styles = StyleSheet.create({
  card: {
    backgroundColor: slate[50],
    borderRadius: radius.large,
    padding: spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowBody: {
    flex: 1,
  },
});
