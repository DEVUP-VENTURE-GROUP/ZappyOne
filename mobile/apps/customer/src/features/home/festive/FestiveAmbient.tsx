/**
 * The festival drifting across the whole home screen while it is on (the
 * website's FestiveAmbient): petals falling, embers rising, gulal, kites,
 * stars or snow, by festival. Never in the way of a tap; none with reduced motion.
 */
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { ambientParticles } from '@zappy/core/shared/season';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const Particle = memo(function Particle({ p, height }: { p: Any; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(p.delay, withRepeat(withTiming(1, { duration: p.dur, easing: Easing.linear }), -1)); }, [p, t]);
  const style = useAnimatedStyle(() => {
    const y = p.up ? height * 1.06 - t.value * height * 1.12 : -height * 0.06 + t.value * height * 1.12;
    return {
      opacity: t.value < 0.08 ? t.value * 11 : t.value > 0.92 ? (1 - t.value) * 11 : 0.85,
      transform: [{ translateY: y }, { translateX: Math.sin(t.value * Math.PI) * p.drift }, { rotate: `${p.shape === 'petal' ? t.value * 440 : 0}deg` }],
    };
  });
  const shape = p.shape === 'kite'
    ? <Svg width={p.size} height={p.size * 1.5} viewBox="0 0 20 30"><Path d="M10,0 L20,11 L10,24 L0,11 Z" fill={p.color} /><Path d="M10,24 Q14,27 9,30" stroke={p.color} strokeWidth={1} fill="none" /></Svg>
    : p.shape === 'star'
      ? <Svg width={p.size} height={p.size} viewBox="0 0 20 20"><Path d="M10,0 L12.4,7.6 L20,10 L12.4,12.4 L10,20 L7.6,12.4 L0,10 L7.6,7.6 Z" fill={p.color} /></Svg>
      : <View style={{ width: p.size, height: p.shape === 'petal' ? p.size * 0.7 : p.size, borderRadius: p.size, backgroundColor: p.color, opacity: p.shape === 'gulal' ? 0.45 : 1 }} />;
  return <Animated.View style={[styles.particle, { left: `${p.x}%` }, style]}>{shape}</Animated.View>;
});

export function FestiveAmbient({ theme }: { theme: string }) {
  const reduce = useReducedMotion();
  const { height } = useWindowDimensions();
  const particles = useMemo(() => ambientParticles(theme, 12), [theme]);
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map((p: Any, i: number) => <Particle key={i} p={p} height={height} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: { position: 'absolute', top: 0 },
});
