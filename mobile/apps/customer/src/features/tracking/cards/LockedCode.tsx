/** A code that exists but is not due yet: shown blurred, so the customer knows how the pro will prove who they are. */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function LockedCode({ title, hint, digits = 6, waiting = false }: { title: string; hint: string; digits?: number; waiting?: boolean }) {
  return (
    <View style={styles.card}>
      <View style={styles.icon}>{waiting ? <ActivityIndicator size="small" color={slate[400]} /> : <ShieldCheck size={18} color={slate[400]} />}</View>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="black" color={ink[700]}>{title}</Text>
        <Text variant="caption" color={ink[500]}>{hint}</Text>
      </View>
      {!waiting ? <View style={styles.dots}>{Array.from({ length: digits }, (_, i) => <View key={i} style={styles.box} />)}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: slate[50] },
  icon: { width: 40, height: 40, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  flex: { flex: 1, minWidth: 0 },
  dots: { flexDirection: 'row', gap: 4 },
  box: { width: 12, height: 24, borderRadius: 4, backgroundColor: slate[200] },
});
