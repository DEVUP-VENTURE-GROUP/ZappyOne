/**
 * While nobody holds the job yet (the website's SearchingHero): we are
 * looking, live, and every pro is verified, so the pane never feels empty.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { MapPin, ShieldCheck, Zap } from 'lucide-react-native';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { Text } from '@zappy/ui/components';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const NAVY = '#0A1830';
const SOFT = '#9FC0FF';

function MiniStat({ icon, n, l }: { icon: React.ReactNode; n: string; l: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.inline}>{icon}<Text variant="caption" weight="black" color="#fff">{n}</Text></View>
      <Text variant="caption" color="rgba(255,255,255,0.5)">{l}</Text>
    </View>
  );
}

export function SearchingHero() {
  const reduce = useReducedMotion();
  const x = useSharedValue(-1);
  useEffect(() => {
    if (!reduce) x.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1);
  }, [reduce, x]);
  // Sweeps from just off the left edge to just off the right.
  const scan = useAnimatedStyle(() => ({ left: `${-33 + (x.value + 1) * 66.5}%` }));
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}><Zap size={20} color={SOFT} fill={SOFT} /></View>
        <View style={styles.flex}>
          <View style={styles.inline}>
            <Text variant="body" weight="black" color="#fff">Finding the best pro nearby</Text>
            <View style={styles.live}><View style={styles.dot} /><Text variant="caption" weight="black" color="#5AE39A">Live</Text></View>
          </View>
          <Text variant="caption" color="rgba(255,255,255,0.6)">Sending your request to top-rated professionals in your area</Text>
        </View>
      </View>
      <View style={styles.track}><Animated.View style={[styles.scan, scan]} /></View>
      <View style={styles.stats}>
        <MiniStat icon={<MapPin size={13} color={SOFT} />} n="Nearby" l="Estimated match" />
        <MiniStat icon={<ShieldCheck size={13} color={SOFT} />} n="Verified" l="ID + background" />
        <MiniStat icon={<Zap size={13} color={SOFT} />} n="Instant" l="Fast match" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.base, padding: spacing.lg, borderRadius: radius.large, overflow: 'hidden', backgroundColor: NAVY },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(37,99,235,0.22)', borderWidth: 1, borderColor: 'rgba(159,192,255,0.25)' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.small, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(18,161,80,0.16)' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D27B' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
  scan: { position: 'absolute', top: 0, bottom: 0, width: '33%', borderRadius: 3, backgroundColor: '#2563FF' },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4, borderRadius: radius.large, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
});
