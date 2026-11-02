import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { colors, danger, ink, slate } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';

// The flat white block every part of tracking sits in; the grey band under it is the separator (the website's Section).
export function Section({ title, children, style }: { title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      {title ? <Text variant="heading3" weight="extrabold" style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

// One line of a list: icon, words, and what tapping it does; a hairline above every row but the first.
export function Row({ Icon, title, sub, right, onPress, tone = 'ink', first = false }: {
  Icon?: LucideIcon; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; onPress?: () => void; tone?: 'ink' | 'danger'; first?: boolean;
}) {
  const body = (
    <>
      {Icon ? <View style={styles.icon}><Icon size={19} strokeWidth={1.9} color={ink[900]} /></View> : null}
      <View style={styles.flex}>
        {typeof title === 'string' ? <Text variant="body" weight={tone === 'danger' ? 'semibold' : 'regular'} color={tone === 'danger' ? danger[600] : ink[900]}>{title}</Text> : title}
        {sub ? (typeof sub === 'string' ? <Text variant="bodySmall" color={ink[500]}>{sub}</Text> : sub) : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={ink[400]} /> : null)}
    </>
  );
  const style = [styles.row, !first && styles.line];
  return onPress
    ? <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [...style, pressed && styles.pressed]}>{body}</Pressable>
    : <View style={style}>{body}</View>;
}

export const sectionStyles = StyleSheet.create({
  band: { borderBottomWidth: 8, borderBottomColor: slate[100] },
});

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing.base, paddingVertical: spacing.base, backgroundColor: colors.surface, borderBottomWidth: 8, borderBottomColor: slate[100] },
  title: { marginBottom: 2, fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: slate[300] },
  pressed: { opacity: 0.6 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
});
