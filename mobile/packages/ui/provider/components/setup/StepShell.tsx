/**
 * One setup step: its title and hint, its content scrolling, and Back /
 * Continue fixed at the bottom where the thumb is.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import { Button, Text } from '../../../components';
import { colors, ink } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';

export function StepShell({ title, hint, children, onBack, onNext, nextLabel = 'Continue', busy = false, canNext = true }: {
  title: string; hint?: string; children: ReactNode; onBack?: () => void; onNext: () => void;
  nextLabel?: string; busy?: boolean; canNext?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <Text variant="heading3" weight="black">{title}</Text>
          {hint ? <Text variant="caption" color={ink[500]}>{hint}</Text> : null}
        </View>
        {children}
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.md }]}>
        {onBack ? <Button label="Back" variant="outline" onPress={onBack} disabled={busy} /> : null}
        <Button label={nextLabel} onPress={onNext} loading={busy} disabled={!canNext} iconRight={<ArrowRight size={15} color="#fff" />} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing.xxl },
  head: { gap: 2, paddingHorizontal: 4 },
  bar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.base, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
