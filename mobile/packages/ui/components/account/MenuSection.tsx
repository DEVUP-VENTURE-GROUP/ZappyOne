/** A titled group of account rows (the website's MenuSection and MenuItem). */
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Text } from '../Text';
import { RIPPLE } from '../../lib/feedback';
import { colors, ink, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" weight="black" color={ink[400]} style={styles.title}>{title.toUpperCase()}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export const MenuItem = memo(function MenuItem({ Icon, label, sublabel, onPress }: { Icon: LucideIcon; label: string; sublabel?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} android_ripple={RIPPLE} accessibilityRole="button" style={styles.row}>
      <View style={styles.icon}><Icon size={18} color={zappy[600]} /></View>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="bold">{label}</Text>
        {sublabel ? <Text variant="caption" color={ink[400]} numberOfLines={1}>{sublabel}</Text> : null}
      </View>
      <ChevronRight size={16} color={slate[300]} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { paddingHorizontal: spacing.base, letterSpacing: 1.2 },
  card: { padding: 4, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.medium },
  icon: { width: 40, height: 40, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  flex: { flex: 1, minWidth: 0 },
});
