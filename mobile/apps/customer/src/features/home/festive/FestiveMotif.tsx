/**
 * The festival's decoration across the top of home (the website's
 * FestiveMotif): the same shared shapes, moved by one clock, so the app and
 * the website look alike. Still when the phone asks for reduced motion.
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, FadeInUp, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { MOTIF_BOX, motifGroups, motifShapes } from '@zappy/core/shared/season';
import { FestiveMotifGroup } from './FestiveMotifGroup';

/** The clock counts seconds up to this, then starts again; every period divides it. */
const LOOP_SEC = 1428;

export function FestiveMotif({ theme }: { theme: string }) {
  const reduce = useReducedMotion();
  const groups = useMemo(() => motifGroups(motifShapes(theme)), [theme]);
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    clock.value = withRepeat(withTiming(LOOP_SEC, { duration: LOOP_SEC * 1000, easing: Easing.linear }), -1, false);
  }, [reduce, clock]);

  return (
    <Animated.View entering={FadeInUp.duration(700)} style={styles.box} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${MOTIF_BOX.w} ${MOTIF_BOX.h}`} preserveAspectRatio="xMidYMin slice">
        {groups.map((g: { key: string }) => <FestiveMotifGroup key={g.key} group={g} clock={reduce ? null : clock} />)}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', top: 0, left: 0, right: 0, height: 104 },
});
