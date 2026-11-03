import { createContext, useContext, type ReactNode } from 'react';
import { Dimensions, type ViewStyle } from 'react-native';
import Animated, { Easing, measure, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';

// The home scroll position, so festive pieces play as they come up the screen (the website's FestiveReveal).
export const HomeScrollY = createContext<SharedValue<number> | null>(null);

/** 0 until the view is 12% into the screen, then eases to 1 once. Reduced motion, or no scroll context: 1 at once. */
export function useInView(delay = 0) {
  const scrollY = useContext(HomeScrollY);
  const reduce = useReducedMotion();
  const ref = useAnimatedRef<Animated.View>();
  const laid = useSharedValue(0);
  const shown = useSharedValue(reduce || !scrollY ? 1 : 0);
  const edge = Dimensions.get('window').height * 0.88;
  useAnimatedReaction(
    () => (scrollY ? scrollY.value : 0) + laid.value,
    () => {
      if (shown.value > 0 || reduce || !scrollY) return;
      const m = measure(ref);
      if (m && m.pageY < edge) shown.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    },
  );
  const onLayout = () => { laid.value += 1; };
  return { ref, shown, onLayout };
}

/** A home section that rises into view as it scrolls up, during a festival (`on`). */
export function Reveal({ on, children, style }: { on: boolean; children: ReactNode; style?: ViewStyle }) {
  const { ref, shown, onLayout } = useInView();
  const a = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 28 }, { scale: 0.985 + shown.value * 0.015 }] }));
  if (!on) return <>{children}</>;
  return <Animated.View ref={ref} onLayout={onLayout} style={[style, a]}>{children}</Animated.View>;
}
