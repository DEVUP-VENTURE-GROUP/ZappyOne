/**
 * A festive moment between home sections (the website's FestiveDivider): as
 * it scrolls into view the lines draw out from the centre, the marigold drops
 * in and swings, and a jhalar slides across beneath.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { JhalarEdge } from './JhalarEdge';
import { useInView } from './ScrollReveal';

export function FestiveDivider({ accent, strip }: { accent: string; strip?: string }) {
  const reduce = useReducedMotion();
  const { ref, shown, onLayout } = useInView();
  const swing = useSharedValue(0);
  useEffect(() => { if (!reduce) swing.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), -1, true); }, [reduce, swing]);
  const sway = useAnimatedStyle(() => ({
    opacity: interpolate(shown.value, [0.3, 0.7], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(shown.value, [0.3, 1], [-22, 0], 'clamp') }, { rotate: `${-7 + swing.value * 14}deg` }],
  }));
  const lineL = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - shown.value) * 32 }, { scaleX: shown.value }] }));
  const lineR = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - shown.value) * 32 }, { scaleX: shown.value }] }));
  const slide = useAnimatedStyle(() => ({ opacity: interpolate(shown.value, [0.5, 1], [0, 1], 'clamp'), transform: [{ translateX: (1 - shown.value) * -60 }] }));
  return (
    <Animated.View ref={ref} onLayout={onLayout} style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.row}>
        <Animated.View style={[styles.line, { backgroundColor: accent }, lineL]} />
        <Animated.View style={[styles.flower, sway]}>
          <Svg width={20} height={30} viewBox="0 0 20 30">
            <Path d="M10,0 L10,13" stroke={accent} strokeWidth={1} />
            <Circle cx={10} cy={17} r={5} fill="#F59E0B" />
            <Circle cx={10} cy={17} r={2.2} fill="#EA580C" />
            <Path d="M6,23 Q10,27 14,23" stroke="#2F7D4A" strokeWidth={1.6} fill="none" strokeLinecap="round" />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.line, { backgroundColor: accent }, lineR]} />
      </View>
      {strip ? <Animated.View style={[styles.strip, slide]}><JhalarEdge color={strip} /></Animated.View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 12 },
  line: { width: 64, height: 1, marginTop: 12, opacity: 0.5 },
  flower: { transformOrigin: 'top' },
  strip: { width: '100%', maxWidth: 360, height: 12, overflow: 'hidden' },
});
