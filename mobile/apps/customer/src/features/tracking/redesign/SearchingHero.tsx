import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { searchStage } from '@zappy/core/shared/searchClock';
import { Text } from '@zappy/ui/components';
import { accent, ink, slate, zappy } from '@zappy/ui/theme/colors';

// What the search is doing now, with its clock (the website's SearchingHero): a quiet line under the headline.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SearchingHero({ search = null, noun = 'pro' }: { search?: any; noun?: string }) {
  const reduce = useReducedMotion();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!search) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [search]);
  const stage = searchStage(search, noun, now);
  const x = useSharedValue(-1);
  useEffect(() => {
    if (!reduce) x.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1);
  }, [reduce, x]);
  const scan = useAnimatedStyle(() => ({ left: `${-33 + (x.value + 1) * 66.5}%` }));
  return (
    <View style={styles.wrap} accessibilityRole="progressbar">
      <View style={styles.track}>
        {stage
          ? <View style={[styles.fill, { width: `${Math.round(stage.pct * 100)}%`, backgroundColor: stage.overdue ? accent[500] : zappy[600] }]} />
          : <Animated.View style={[styles.scan, scan]} />}
      </View>
      <View style={styles.row}>
        <Text variant="bodySmall" color={ink[500]} style={styles.flex}>{stage ? stage.line : `Sending your request to verified ${noun}s nearby`}</Text>
        {stage ? <Text variant="bodySmall" weight="semibold">{stage.clock}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: slate[300] },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: slate[100] },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2 },
  scan: { position: 'absolute', top: 0, bottom: 0, width: '33%', borderRadius: 2, backgroundColor: zappy[600] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
});
