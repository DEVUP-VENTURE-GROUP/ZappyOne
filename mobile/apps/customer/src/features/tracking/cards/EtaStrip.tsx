/**
 * The ETA line under the pro's card (the website's AnimatedETA): calculating,
 * minutes away (orange and "Almost here" under three), or arrived. The number
 * slides in when it changes.
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { MapPin, Navigation, Zap } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { accent, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function EtaStrip({ etaMinutes, arrived }: { etaMinutes: number | null; arrived: boolean }) {
  if (arrived) {
    return (
      <View style={[styles.strip, { backgroundColor: success[50] }]}>
        <View style={styles.inline}><MapPin size={14} color={success[700]} /><Text variant="bodySmall" weight="bold" color={success[700]}>Your pro has arrived</Text></View>
        <Text variant="caption" weight="black" color={success[700]}>At your location</Text>
      </View>
    );
  }
  const urgent = etaMinutes != null && etaMinutes <= 2;
  const tone = urgent ? accent[700] : zappy[700];
  return (
    <View style={[styles.strip, { backgroundColor: urgent ? accent[50] : zappy[50] }]}>
      <View style={styles.inline}>{urgent ? <Zap size={14} color={tone} /> : <Navigation size={13} color={tone} />}<Text variant="caption" weight="semibold" color={tone}>Estimated arrival</Text></View>
      {etaMinutes == null ? (
        <View style={styles.inline}><Text variant="caption" weight="semibold" color={zappy[500]}>Calculating</Text><ActivityIndicator size="small" color={zappy[400]} /></View>
      ) : (
        <View style={styles.inline}>
          <Animated.View key={etaMinutes} entering={FadeInUp.duration(250)}><Text variant="heading3" weight="black" color={tone}>{etaMinutes}</Text></Animated.View>
          <Text variant="caption" weight="bold" color={tone}>min{etaMinutes === 1 ? '' : 's'}</Text>
          {urgent ? <View style={styles.soon}><Text variant="caption" weight="black" color={accent[700]}>Almost here!</Text></View> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderRadius: radius.medium },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  soon: { marginLeft: 4, borderRadius: radius.pill, paddingHorizontal: 6, backgroundColor: accent[100] },
});
