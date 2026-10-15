/**
 * Spotlight scene: a real photograph of the celebration (the website's
 * SpotlightPhoto): a woman carrying her Bathukamma, a girl with her dandiya
 * sticks, a garba twirl. It zooms slowly like film, warm light over it,
 * fairy lights twinkling along the top, the line rising in at the bottom.
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { fairyLights } from '@zappy/core/shared/season';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function SpotlightPhoto({ scene, theme }: { scene: Any; theme: Any }) {
  const reduce = useReducedMotion();
  const lights = useMemo(() => fairyLights().filter((l: Any) => l.cy < 30), []);
  const zoom = useSharedValue(reduce ? 1.02 : 1.18);
  const glow = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    zoom.value = withTiming(1.02, { duration: 6000, easing: Easing.out(Easing.quad) });
    glow.value = withRepeat(withSequence(withTiming(0.35, { duration: 850 }), withTiming(1, { duration: 850 })), -1);
  }, [reduce, zoom, glow]);
  const film = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  const twinkle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const [fx, fy] = String(scene.focus || '50% 50%').split(' ').map((v) => parseFloat(v) / 100);
  const enter = (ms: number) => (reduce ? undefined : FadeInDown.delay(ms).duration(450));

  return (
    <View style={[styles.card, { shadowColor: theme.dark ? '#000' : '#7a4a00' }]}>
      <Animated.Image source={{ uri: webAsset(scene.photo) || undefined }} resizeMode="cover"
        style={[StyleSheet.absoluteFill, film, { transformOrigin: `${fx * 100}% ${fy * 100}%` }]} />
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="light" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFAA28" stopOpacity="0.28" />
            <Stop offset="0.38" stopColor="#000" stopOpacity="0" />
            <Stop offset="1" stopColor="#280C00" stopOpacity="0.78" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#light)" />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, twinkle]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 360 200" preserveAspectRatio="xMidYMin slice">
          {lights.map((l: Any, i: number) => (
            <G key={i}><Circle cx={l.cx} cy={l.cy} r={l.r * 3.4} fill="#FDE68A" opacity={0.35} /><Circle cx={l.cx} cy={l.cy} r={l.r} fill="#FFF7D6" /></G>
          ))}
        </Svg>
      </Animated.View>
      <View style={styles.words}>
        <Animated.View entering={enter(300)}><Text variant="caption" weight="black" color="#FDE68A" style={styles.kicker}>{String(scene.kicker).toUpperCase()}</Text></Animated.View>
        <Animated.View entering={enter(450)}><Text variant="heading2" weight="black" color="#fff" style={styles.title}>{scene.title}</Text></Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', top: 6, bottom: 6, left: 12, right: 12, borderRadius: 24, overflow: 'hidden', backgroundColor: '#2a1200',
    shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6,
  },
  words: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  kicker: { letterSpacing: 2.2 },
  title: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
});
