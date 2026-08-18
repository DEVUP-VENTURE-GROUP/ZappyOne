/**
 * Search pulse — the waiting indicator.
 * ----------------------------------------------------------------------------
 * Three concentric rings expanding out of a centre mark, staggered so one is
 * always mid-flight. That is the whole effect: no sweeping radar arm, no
 * spinner, no bouncing. Someone stares at this for a minute or more while they
 * wait to find out whether anyone is coming, and a busy animation reads as
 * agitation rather than progress.
 *
 * Everything runs on the UI thread through Reanimated shared values, so it
 * keeps its rhythm while the JS thread handles socket traffic and refetches.
 *
 * `useReducedMotion` collapses it to a static ring set — no looping animation
 * is started at all, rather than started and hidden. An indefinite repeat is
 * exactly what motion-sensitivity settings exist to stop.
 *
 * IT SHOWS NO PROGRESS. The rings are not a progress bar and are not timed to
 * anything: dispatch has no predictable duration, and animating toward an
 * apparent completion would imply a promise the server has not made. Real
 * progress comes from `order.dispatch_update`, rendered as text by the caller.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../theme/colors';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface SearchPulseProps {
  /** Diameter of the widest ring. */
  size?: number;
  color?: string;
  children?: React.ReactNode;
}

const RING_COUNT = 3;
const CYCLE_MS = 2600;

function Ring({
  size,
  color,
  delay,
  reducedMotion,
}: {
  size: number;
  color: string;
  delay: number;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      // Park each ring at a distinct radius so the shape still reads as rings.
      progress.value = 0.35 + (delay / CYCLE_MS) * 0.4;
      return;
    }
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: CYCLE_MS, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [progress, delay, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    // Starts at 40% and fades as it grows — an expanding wave, not a throb.
    transform: [{ scale: 0.4 + progress.value * 0.6 }],
    opacity: (1 - progress.value) * 0.5,
  }));

  return (
    <Animated.View
      style={[
        styles.ring,
        styles.noTouch,
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
        style,
      ]}
    />
  );
}

function SearchPulseBase({ size = 168, color = colors.primary, children }: SearchPulseProps) {
  const reducedMotion = useReducedMotion();

  return (
    <View
      style={[styles.root, { width: size, height: size }]}
      accessibilityRole="progressbar"
      // Screen readers get the state, not the decoration. The rings carry no
      // information a non-sighted user could act on.
      accessibilityLabel="Searching for a professional"
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: RING_COUNT }, (_, index) => (
        <Ring
          key={index}
          size={size}
          color={color}
          delay={(CYCLE_MS / RING_COUNT) * index}
          reducedMotion={reducedMotion}
        />
      ))}
      <View style={[styles.core, { backgroundColor: `${color}1F` }]}>{children}</View>
    </View>
  );
}

export const SearchPulse = memo(SearchPulseBase);

const styles = StyleSheet.create({
  /** RN 0.85 deprecates the pointerEvents PROP; it belongs in style now. */
  noTouch: { pointerEvents: 'none' },
  root: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5 },
  core: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
