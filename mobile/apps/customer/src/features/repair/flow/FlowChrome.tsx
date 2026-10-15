/**
 * The frame every booking step sits in: the header with "Step n", the title,
 * the device, a back arrow and a progress bar (numbered by the steps actually
 * shown), and the scrolling body.
 */
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { LoadingState, Text } from '@zappy/ui/components';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function StepHeader({ steps, step, skipped, title, subtitle, onBack }: {
  steps: string[]; step: string; skipped: Set<string>; title: string; subtitle?: string; onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Numbered by the screens actually shown, so the count never jumps.
  const shown = steps.filter((s) => s === step || !skipped.has(s));
  const index = shown.indexOf(step);
  const last = index === shown.length - 1;
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}><ArrowLeft size={17} color={ink[900]} /></Pressable>
        <View style={styles.flex}>
          <Text variant="caption" weight="bold" color={zappy[600]}>STEP {index + 1}{last ? ', LAST STEP' : ''}</Text>
          <Text variant="body" weight="bold" numberOfLines={1}>{title}</Text>
          {subtitle ? <Text variant="caption" color={ink[400]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.track}><View style={[styles.bar, { width: `${((index + 1) / Math.max(shown.length, 1)) * 100}%` }]} /></View>
    </View>
  );
}

/** The scrolling body of a step. */
export function Shell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <ScrollView contentContainerStyle={[styles.shell, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export const Spinner = () => <View style={styles.spinner}><LoadingState /></View>;

/** Shared card look for the steps. */
export const flow = StyleSheet.create({
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  label: { paddingHorizontal: 4 },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
});

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: slate[100] },
  back: { width: 36, height: 36, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  track: { height: 2, backgroundColor: slate[100] },
  bar: { height: 2, backgroundColor: zappy[600] },
  shell: { padding: spacing.base, gap: spacing.md },
  spinner: { paddingVertical: spacing.xxl },
});
