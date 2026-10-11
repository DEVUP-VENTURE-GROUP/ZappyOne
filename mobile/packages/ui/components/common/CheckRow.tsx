/** A tick box with its sentence, the whole row tappable (the websites' labelled checkboxes and radios). */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '../Text';
import { colors, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function CheckRow({ checked, onChange, children, round = false, boxed = true }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; round?: boolean; boxed?: boolean }) {
  return (
    <Pressable onPress={() => onChange(!checked)} accessibilityRole={round ? 'radio' : 'checkbox'} accessibilityState={round ? { selected: checked } : { checked }} style={[styles.row, boxed && styles.boxed]}>
      <View style={[styles.box, round && styles.round, checked && styles.on]}>{checked ? <Check size={13} color="#fff" strokeWidth={3} /> : null}</View>
      {typeof children === 'string' ? <Text variant="bodySmall" style={styles.flex}>{children}</Text> : <View style={styles.flex}>{children}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: 6 },
  boxed: { padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  box: { width: 20, height: 20, marginTop: 1, borderRadius: 5, borderWidth: 2, borderColor: slate[300], alignItems: 'center', justifyContent: 'center' },
  round: { borderRadius: 10 },
  on: { borderColor: zappy[600], backgroundColor: zappy[600] },
  flex: { flex: 1 },
});
