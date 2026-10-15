/** Spotlight scene: marigold petals drifting down and lanterns rising, behind the season's promise (the website's SpotlightPetals). */
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { fallingPetals, risingLanterns } from '@zappy/core/shared/season';
import { Text } from '@zappy/ui/components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const Petal = memo(function Petal({ p }: { p: Any }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(p.delay, withRepeat(withTiming(1, { duration: p.dur, easing: Easing.linear }), -1)); }, [p, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.1 ? t.value * 10 : t.value > 0.9 ? (1 - t.value) * 10 : 1,
    transform: [{ translateY: -24 + t.value * 254 }, { translateX: Math.sin(t.value * Math.PI) * p.drift }, { rotate: `${t.value * 420}deg` }],
  }));
  return <Animated.View style={[styles.petal, { left: `${p.x}%`, width: p.size, height: p.size * 0.7, backgroundColor: p.color }, style]} />;
});

const Lantern = memo(function Lantern({ l, color }: { l: Any; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(l.delay, withRepeat(withTiming(1, { duration: l.dur, easing: Easing.inOut(Easing.quad) }), -1)); }, [l, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.15 ? t.value / 0.15 : 1 - t.value,
    transform: [{ translateY: 40 - t.value * 270 }, { scale: 0.85 + t.value * 0.15 }],
  }));
  return (
    <Animated.View style={[styles.lantern, { left: `${l.x}%` }, style]}>
      <Svg width={l.size} height={l.size * 1.4} viewBox="0 0 20 28">
        <Circle cx={10} cy={15} r={11} fill="#FDE68A" opacity={0.35} />
        <Path d="M5,6 L15,6 L17,20 Q10,25 3,20 Z" fill={color} />
        <Path d="M7,20 Q10,22 13,20 L12,24 L8,24 Z" fill="#FBBF24" />
        <Rect x={6} y={3} width={8} height={3} rx={1} fill="#7C2D12" />
      </Svg>
    </Animated.View>
  );
});

export function SpotlightPetals({ season, theme }: { season: Any; theme: Any }) {
  const reduce = useReducedMotion();
  const petals = useMemo(() => fallingPetals(['#F97316', '#FBBF24', '#EA580C', '#FDE047'], 16), []);
  const lanterns = useMemo(() => risingLanterns(5), []);
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]}>
      {!reduce ? lanterns.map((l: Any, i: number) => <Lantern key={`l${i}`} l={l} color={theme.accent} />) : null}
      {!reduce ? petals.map((p: Any, i: number) => <Petal key={`p${i}`} p={p} />) : null}
      <Animated.View entering={reduce ? undefined : ZoomIn.delay(250).springify()} style={styles.center}>
        <Text variant="heading2" weight="black" color={theme.ink} style={styles.text}>{season.subline}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  petal: { position: 'absolute', top: 0, borderRadius: 6 },
  lantern: { position: 'absolute', bottom: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  text: { textAlign: 'center' },
});
