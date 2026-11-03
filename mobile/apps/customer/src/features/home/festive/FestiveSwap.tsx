import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { swapSparks } from '@zappy/core/shared/season';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Spark = { x: number; y: number; r: number; dx: number; dy: number; fill: string; delay: number };

function Dot({ p, t }: { p: Spark; t: SharedValue<number> }) {
  const start = p.delay / 1.1;
  const a = useAnimatedStyle(() => {
    const k = interpolate(t.value, [start, 1], [0, 1], 'clamp');
    return { opacity: interpolate(k, [0, 0.25, 1], [0, 1, 0]), transform: [{ translateX: p.dx * k }, { translateY: p.dy * k }, { scale: interpolate(k, [0, 0.25, 1], [0.2, 1.2, 0.4]) }] };
  });
  return <Animated.View style={[{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: p.r * 2, height: p.r * 2, borderRadius: p.r, backgroundColor: p.fill }, a]} />;
}

/** When the festival moves to its next look: its curtain colour sweeps down the top and sparks burst (the website's FestiveSwap). */
export function FestiveSwap({ theme }: { theme: Any }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(1);
  const h = useSharedValue(400);
  const first = useRef(theme.look);
  const sparks = useMemo(() => swapSparks(theme) as Spark[], [theme]);
  useEffect(() => {
    if (reduce || theme.look === first.current) return;
    first.current = -1;
    t.value = 0;
    t.value = withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) });
  }, [theme.look, reduce, t]);
  const curtain = useAnimatedStyle(() => ({
    opacity: t.value >= 1 ? 0 : interpolate(t.value, [0, 0.45, 1], [0.92, 0.92, 0]),
    transform: [{ translateY: interpolate(t.value, [0, 0.45, 1], [-h.value, 0, h.value]) }],
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => { h.value = e.nativeEvent.layout.height; }}>
      <View style={[StyleSheet.absoluteFill, styles.clip]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.curtain }, curtain]} />
        {sparks.map((p, i) => <Dot key={`${theme.look}-${i}`} p={p} t={t} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden', zIndex: 20 } });
