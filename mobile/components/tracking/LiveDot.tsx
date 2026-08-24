/**
 * The pulsing "live" dot.
 * ----------------------------------------------------------------------------
 * The website animates this with a CSS keyframe (`zpt-beat`, 1.6–1.8s). Here it
 * is a Reanimated loop so it runs on the UI thread and costs nothing on the JS
 * side while the socket is busy delivering updates.
 *
 * Respects reduce-motion: the dot simply stops pulsing and stays visible, which
 * is what the state actually needs to communicate.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export interface LiveDotProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

function LiveDotBase({ size = 7, color = '#34D27B', style }: LiveDotProps) {
  const pulse = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (reduceMotion) {
    return (
      <View
        style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
      />
    );
  }

  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        animated,
        style,
      ]}
    />
  );
}

export const LiveDot = memo(LiveDotBase);

export const liveDotStyles = StyleSheet.create({});
