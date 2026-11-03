/** How far the job is, drawn as the trip: you, the road, the customer; a dot travels the route (the website's DistanceStrip). */
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { MapPin, Navigation } from 'lucide-react-native';
import { roadMinutes } from '@zappy/core/shared/distance';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { Text } from '..';
import { zappy, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function DistanceStrip({ km }: { km: number | null }) {
  const still = useReducedMotion();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    if (still || !width) return;
    x.value = withDelay(300, withRepeat(withTiming(Math.max(0, width - 12), { duration: 2400, easing: Easing.inOut(Easing.ease) }), -1, false));
  }, [still, width, x]);
  const dot = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (km == null) return null;
  return (
    <View style={styles.wrap} accessibilityLabel={`${km.toFixed(1)} km away, about ${roadMinutes(km)} minutes`}>
      <View style={styles.row}>
        <Navigation size={12} color={zappy[700]} /><Text variant="caption" weight="bold" color={zappy[700]}>You</Text>
        <View style={styles.track} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          <View style={styles.line} />
          {!still ? <Animated.View style={[styles.dot, dot]} /> : null}
        </View>
        <Text variant="caption" weight="bold" color={zappy[700]}>Customer</Text><MapPin size={12} color={zappy[700]} />
      </View>
      <Text variant="bodySmall" weight="bold" style={styles.center}>{km.toFixed(1)} km <Text variant="caption" color={ink[500]}>· about {roadMinutes(km)} min away</Text></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.large, backgroundColor: zappy[50], gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  track: { flex: 1, height: 12, justifyContent: 'center', marginHorizontal: 4 },
  line: { height: 3, borderRadius: 2, backgroundColor: zappy[200] },
  dot: { position: 'absolute', left: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff', backgroundColor: zappy[700] },
  center: { textAlign: 'center' },
});
