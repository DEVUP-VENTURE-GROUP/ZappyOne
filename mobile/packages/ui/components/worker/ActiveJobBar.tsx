// The job under way stays pinned at the bottom of Home until it is completed; one tap opens it (the websites' ActiveJobBar).
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '..';
import { providerPath } from '../../provider/paths';
import { ink, success } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

type Job = { id: string; to: string; title: string; status: string };

export function ActiveJobBar({ jobs = [] }: { jobs?: Job[] }) {
  const router = useRouter();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (still) return;
      loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }));
      loop.start();
    }).catch(() => {});
    return () => { loop?.stop(); };
  }, [pulse]);
  const job = jobs[0];
  if (!job) return null;
  const more = jobs.length - 1;
  const ring = { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] };
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable onPress={() => router.push(providerPath(job.to) as never)} accessibilityRole="button" accessibilityLabel={`Open ${job.title}`} style={styles.bar}>
        <View style={styles.dotBox}>
          <Animated.View style={[styles.dot, styles.ring, ring]} />
          <View style={styles.dot} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="semibold" color="#FFFFFF" numberOfLines={1}>{job.title}</Text>
          <Text variant="caption" color="rgba(255,255,255,0.7)" numberOfLines={1}>{job.status}{more > 0 ? ` · ${more} more job${more > 1 ? 's' : ''}` : ''}</Text>
        </View>
        <Text variant="bodySmall" weight="bold" color="#FFFFFF">Open</Text>
        <ChevronRight size={16} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.base, right: spacing.base, bottom: spacing.md },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderRadius: radius.large, backgroundColor: ink[900], elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  dotBox: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: success[500] },
  ring: { position: 'absolute' },
  flex: { flex: 1, minWidth: 0 },
});
