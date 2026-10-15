/**
 * A small festive ornament between home sections (the website's
 * FestiveDivider): two fine lines meeting at a marigold that sways.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';

export function FestiveDivider({ accent }: { accent: string }) {
  const reduce = useReducedMotion();
  const swing = useSharedValue(0);
  useEffect(() => { if (!reduce) swing.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), -1, true); }, [reduce, swing]);
  const sway = useAnimatedStyle(() => ({ transform: [{ rotate: `${-7 + swing.value * 14}deg` }] }));
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.line, { backgroundColor: accent }]} />
      <Animated.View style={[styles.flower, sway]}>
        <Svg width={20} height={30} viewBox="0 0 20 30">
          <Path d="M10,0 L10,13" stroke={accent} strokeWidth={1} />
          <Circle cx={10} cy={17} r={5} fill="#F59E0B" />
          <Circle cx={10} cy={17} r={2.2} fill="#EA580C" />
          <Path d="M6,23 Q10,27 14,23" stroke="#2F7D4A" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <View style={[styles.line, { backgroundColor: accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 12 },
  line: { width: 64, height: 1, marginTop: 12, opacity: 0.5 },
  flower: { transformOrigin: 'top' },
});
