/**
 * Press-scale primitive.
 * ----------------------------------------------------------------------------
 * The website signals press with `active:scale-[0.96]`. This reproduces that
 * on native using Reanimated, so the animation runs on the UI thread and
 * survives a busy JS thread — the difference between "premium" and "laggy" on
 * a mid-range Android device.
 *
 * Every interactive surface in the design system composes this rather than
 * re-implementing the gesture.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useCallback } from 'react';
import {
  Pressable as RNPressable,
  type PressableProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { pressScale, timing } from '../../theme/animation';
import { minTouchTarget } from '../../theme/spacing';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export interface ScalePressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** How far to scale on press. Defaults to the button value (0.96). */
  scaleTo?: number;
  /** Set false for surfaces that shouldn't animate (e.g. a full-bleed row). */
  animated?: boolean;
  children?: React.ReactNode;
}

function ScalePressableBase({
  style,
  scaleTo = pressScale.button,
  animated = true,
  disabled,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: ScalePressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      if (animated && !disabled) {
        scale.value = withTiming(scaleTo, timing.instant);
      }
      onPressIn?.(event);
    },
    [animated, disabled, scale, scaleTo, onPressIn],
  );

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (event) => {
      if (animated && !disabled) {
        scale.value = withTiming(1, timing.fast);
      }
      onPressOut?.(event);
    },
    [animated, disabled, scale, onPressOut],
  );

  return (
    <AnimatedPressable
      style={[style, animatedStyle]}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      // Expand the touch target without changing layout — small icons and
      // chips otherwise fall short of the 44pt minimum.
      hitSlop={8}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

export const ScalePressable = memo(ScalePressableBase);

export { minTouchTarget };
