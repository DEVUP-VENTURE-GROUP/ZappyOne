/**
 * One clock for a festive scene's movements, in seconds, on the UI thread.
 * Still (null) when the phone asks for reduced motion.
 */
import { useEffect } from 'react';
import { Easing, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';

const LOOP_SEC = 1428;

export function useFestiveClock(): SharedValue<number> | null {
  const reduce = useReducedMotion();
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    clock.value = withRepeat(withTiming(LOOP_SEC, { duration: LOOP_SEC * 1000, easing: Easing.linear }), -1, false);
  }, [reduce, clock]);
  return reduce ? null : clock;
}

/** 0..1..0 over `period` seconds, offset by `delay` (a worklet). */
export function wave(t: number, period: number, delay = 0) {
  'worklet';
  return (Math.sin((((t + delay) % period) / period) * Math.PI * 2) + 1) / 2;
}
