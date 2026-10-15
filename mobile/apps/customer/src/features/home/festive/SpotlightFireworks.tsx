/** Spotlight scene: fireworks bursting behind the festival's greeting (the website's SpotlightFireworks). */
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, ZoomIn, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { fireworkBursts } from '@zappy/core/shared/season';
import { Text } from '@zappy/ui/components';
import { useFestiveClock } from './useFestiveClock';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const AnimatedG = Animated.createAnimatedComponent(G);

const Burst = memo(function Burst({ b, clock }: { b: Any; clock: SharedValue<number> | null }) {
  const props = useAnimatedProps<Any>(() => {
    if (!clock) return {};
    const p = ((clock.value + 2.4 - b.delay) % 2.4) / 2.4;
    const s = p < 0.55 ? 0.1 + (p / 0.55) * 0.9 : 1 + (p - 0.55) * 0.33;
    const o = p < 0.12 ? p / 0.12 : p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
    return { opacity: o, transform: `translate(${b.cx} ${b.cy}) scale(${s}) translate(${-b.cx} ${-b.cy})` };
  });
  return (
    <AnimatedG animatedProps={props}>
      {b.sparks.map((s: Any, k: number) => <Line key={k} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={b.color} strokeWidth={2} strokeLinecap="round" />)}
      <Circle cx={b.cx} cy={b.cy} r={2.4} fill="#FFFFFF" />
    </AnimatedG>
  );
});

export function SpotlightFireworks({ season, theme }: { season: Any; theme: Any }) {
  const clock = useFestiveClock();
  const bursts = useMemo(() => fireworkBursts([theme.accent, '#FDE68A', theme.dark ? '#F0ABFC' : '#FFFFFF', '#FB923C']), [theme]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice">
        {bursts.map((b: Any, i: number) => <Burst key={i} b={b} clock={clock} />)}
      </Svg>
      <Animated.View entering={clock ? ZoomIn.delay(300).springify() : undefined} style={styles.center}>
        <Text weight="black" color={theme.ink} style={styles.big}>{season.greeting || season.headline}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  big: { fontSize: 30, lineHeight: 34, textAlign: 'center', letterSpacing: -0.8 },
});
