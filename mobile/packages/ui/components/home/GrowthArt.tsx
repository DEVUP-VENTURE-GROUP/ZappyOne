import { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { GROWTH_BOX, GROWTH_BUILDINGS, GROWTH_COLORS as C, GROWTH_PIN, GROWTH_PIN_PATH, GROWTH_ROAD, GROWTH_STOPS, growthWindows } from '@zappy/core/shared/growthArt';

const WINDOWS = growthWindows();
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// A city skyline, the road ZappyOne is building along, the stops already live, and our pin settling on your spot (the website's GrowthArt).
export function GrowthArt({ width = 300 }: { width?: number }) {
  const reduce = useReducedMotion();
  const bob = useSharedValue(0);
  const dash = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    bob.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }), -1, true);
    dash.value = withRepeat(withTiming(-22, { duration: 1100, easing: Easing.linear }), -1, false);
  }, [reduce, bob, dash]);
  const pinProps = useAnimatedProps(() => ({ transform: [{ translateX: GROWTH_PIN.x }, { translateY: GROWTH_PIN.y - 6 + bob.value * 10 }] }));
  const roadProps = useAnimatedProps(() => ({ strokeDashoffset: dash.value }));
  const { ground } = GROWTH_PIN;
  return (
    <Svg width={width} height={(width * GROWTH_BOX.h) / GROWTH_BOX.w} viewBox={`0 0 ${GROWTH_BOX.w} ${GROWTH_BOX.h}`} accessibilityLabel="ZappyOne growing towards your area">
      <Ellipse cx={160} cy={118} rx={150} ry={96} fill={C.halo} />
      {GROWTH_BUILDINGS.map((b: { x: number; y: number; w: number; h: number; tone: string }, i: number) => <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill={b.tone === 'near' ? C.near : C.far} />)}
      {WINDOWS.map((w: { x: number; y: number; w: number; h: number }, i: number) => <Rect key={`w${i}`} x={w.x} y={w.y} width={w.w} height={w.h} rx={1} fill={C.window} />)}
      <AnimatedPath d={GROWTH_ROAD} fill="none" stroke={C.road} strokeWidth={5} strokeLinecap="round" strokeDasharray="0 11" animatedProps={roadProps} />
      {GROWTH_STOPS.map((s: { cx: number; cy: number }, i: number) => (
        <G key={i}><Circle cx={s.cx} cy={s.cy} r={9} fill={C.pin} /><Circle cx={s.cx} cy={s.cy} r={3.5} fill={C.window} /></G>
      ))}
      <Ellipse cx={ground.cx} cy={ground.cy} rx={18} ry={5} fill={C.shadow} opacity={0.18} />
      <AnimatedG animatedProps={pinProps}>
        <Path d={GROWTH_PIN_PATH} fill={C.pin} />
        <Path d="M0,-36 C20,-36 36,-20 36,0 C36,26 0,56 0,56 Z" fill={C.pinDark} opacity={0.25} />
        <Circle r={15} fill={C.window} />
        <Circle r={6.5} fill={C.dot} />
      </AnimatedG>
    </Svg>
  );
}
