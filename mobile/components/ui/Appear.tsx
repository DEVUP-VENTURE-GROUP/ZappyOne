/**
 * Appear — a mount fade that cannot strand its content.
 * ----------------------------------------------------------------------------
 * Reanimated's declarative `entering={FadeIn}` sets the view to
 * `visibility: hidden` and clears it from the layout-animation callback. When a
 * view mounts CONDITIONALLY into an already-mounted tree — the usual case for
 * anything that appears once data arrives — that callback can fail to run, and
 * the content stays permanently invisible while still occupying its full
 * layout box. It was caught on the booking screen's quote card: the price, the
 * distance and the disclaimer were all in the tree, correctly laid out at 190px
 * tall, and none of it could be seen.
 *
 * This drives opacity and translation from shared values instead. The animation
 * is still on the UI thread and still uses the website's easing, but the
 * steady state is plain `opacity: 1` — there is no callback that can fail to
 * fire, so worst case the content simply appears without animating.
 *
 * Use this for anything that mounts after the screen does. `entering={...}` is
 * fine for content present on first render.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { timing } from '../../theme/animation';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface AppearProps {
  children: React.ReactNode;
  /** Milliseconds to wait before fading in. Used to stagger a list. */
  delay?: number;
  /** Upward travel in px. 0 for a pure fade. */
  offsetY?: number;
  style?: StyleProp<ViewStyle>;
}

function AppearBase({ children, delay = 0, offsetY = 8, style }: AppearProps) {
  const reducedMotion = useReducedMotion();
  // Start visible when motion is reduced — no fade, no travel, no risk.
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(delay, withTiming(1, timing.normal));
  }, [delay, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * offsetY }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

export const Appear = memo(AppearBase);
