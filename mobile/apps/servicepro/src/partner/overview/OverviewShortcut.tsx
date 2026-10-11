/** A shortcut on the home; before verification it says when it opens. */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Lock, type LucideIcon } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function OverviewShortcut({ Icon, title, text, to, locked }: { Icon: LucideIcon; title: string; text: string; to: string; locked: boolean }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(to as never)} disabled={locked} android_ripple={RIPPLE} accessibilityRole="button" accessibilityState={{ disabled: locked }} style={[styles.card, locked && styles.locked]}>
      <View style={styles.icon}><Icon size={18} color={zappy[600]} /></View>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="bold">{title}</Text>
        <Text variant="caption" color={ink[500]}>{locked ? 'After verification' : text}</Text>
      </View>
      {locked ? <Lock size={16} color={slate[300]} /> : <ChevronRight size={16} color={slate[300]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  locked: { opacity: 0.6 },
  icon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1 },
});
