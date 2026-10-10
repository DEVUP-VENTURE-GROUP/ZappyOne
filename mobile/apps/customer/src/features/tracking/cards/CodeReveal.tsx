/** A code that is due now, large, to read out: the start code (blue) or a handover code (violet). */
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { ShieldCheck } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function CodeReveal({ code, title, hint, color }: { code: string; title: string; hint: string; color: string }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(18)} style={[styles.card, { backgroundColor: color }]}>
      <View style={styles.head}><ShieldCheck size={15} color="rgba(255,255,255,0.8)" /><Text variant="caption" weight="black" color="rgba(255,255,255,0.85)" style={styles.upper}>{title}</Text></View>
      <View style={styles.digits}>
        {String(code).split('').map((d, i) => <View key={i} style={styles.digit}><Text variant="heading1" weight="black" color="#fff">{d}</Text></View>)}
      </View>
      <Text variant="caption" weight="semibold" color="rgba(255,255,255,0.75)" style={styles.center}>{hint}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  upper: { textTransform: 'uppercase', letterSpacing: 1.2 },
  digits: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  digit: { width: 46, height: 60, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  center: { textAlign: 'center' },
});
