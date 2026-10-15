/**
 * Spotlight scene: the festival greeting on a stage (the website's
 * SpotlightGreeting). The curtains sweep open from both corners, fairy lights
 * twinkle, then the greeting rises in.
 */
import { useEffect, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { curtainShapes, fairyLights } from '@zappy/core/shared/season';
import { Text } from '@zappy/ui/components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const draw = (c: Any, i: number) => <Path key={i} d={c.d} fill={c.fill || 'none'} stroke={c.stroke || 'none'} strokeWidth={c.sw || 0} strokeLinecap="round" opacity={c.o ?? 1} />;

export function SpotlightGreeting({ season, theme }: { season: Any; theme: Any }) {
  const reduce = useReducedMotion();
  const curtains = useMemo(() => curtainShapes(theme.curtain), [theme.curtain]);
  const lights = useMemo(() => fairyLights(), []);
  const open = useSharedValue(reduce ? 1 : 0);
  const glow = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    open.value = withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) });
    glow.value = withRepeat(withSequence(withTiming(0.35, { duration: 850 }), withTiming(1, { duration: 850 })), -1);
  }, [reduce, open, glow]);
  // The curtains start drawn across the stage and sweep back to their corners.
  const left = useAnimatedStyle(() => ({ transform: [{ scaleX: 3.1 - 2.1 * open.value }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ scaleX: 3.1 - 2.1 * open.value }] }));
  const twinkle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const bulb = theme.dark ? '#FDE68A' : '#FFFFFF';
  const enter = (ms: number) => (reduce ? undefined : FadeInDown.delay(ms).duration(500));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, twinkle]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 360 200" preserveAspectRatio="xMidYMin slice">
          {lights.map((l: Any, i: number) => (
            <G key={i}><Circle cx={l.cx} cy={l.cy} r={l.r * 3.2} fill={bulb} opacity={0.25} /><Circle cx={l.cx} cy={l.cy} r={l.r} fill={bulb} /></G>
          ))}
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.fromLeft, left]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 360 200" preserveAspectRatio="xMidYMin slice">{curtains.filter((c: Any) => c.side === 'left').map(draw)}</Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.fromRight, right]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 360 200" preserveAspectRatio="xMidYMin slice">{curtains.filter((c: Any) => c.side === 'right').map(draw)}</Svg>
      </Animated.View>
      <View style={styles.text}>
        {season.artUrl ? <Animated.View entering={reduce ? undefined : ZoomIn.delay(500)}><Image source={{ uri: season.artUrl }} style={styles.art} resizeMode="contain" /></Animated.View> : null}
        {season.greeting ? <Animated.View entering={enter(550)}><Text variant="caption" weight="black" color={theme.accent} style={styles.greeting}>{season.greeting.toUpperCase()}</Text></Animated.View> : null}
        <Animated.View entering={enter(700)}><Text variant="heading1" weight="black" color={theme.ink} style={styles.center}>{season.headline}</Text></Animated.View>
        {season.subline ? <Animated.View entering={enter(850)}><Text variant="caption" color={theme.sub} style={styles.center}>{season.subline}</Text></Animated.View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fromLeft: { transformOrigin: 'left top' },
  fromRight: { transformOrigin: 'right top' },
  text: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 2 },
  art: { width: 200, height: 60 },
  greeting: { letterSpacing: 2.2, textAlign: 'center' },
  center: { textAlign: 'center', letterSpacing: -0.4 },
});
