/** A list typed one item at a time (or several, comma-separated): what is and is not included. */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Button, Input, Text } from '@zappy/ui/components';
import { danger, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function ListInput({ label, required, value, onChange, placeholder }: { label: string; required?: boolean; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...value, ...parts].slice(0, 30));
    setDraft('');
  };
  return (
    <View style={styles.wrap}>
      <Text variant="bodySmall" weight="semibold">{label}{required ? <Text variant="bodySmall" color={danger[500]}> *</Text> : null}</Text>
      <View style={styles.row}>
        <View style={styles.flex}><Input value={draft} onChangeText={setDraft} onSubmitEditing={add} returnKeyType="done" placeholder={placeholder} /></View>
        <Button label="Add" size="small" variant="outline" onPress={add} disabled={!draft.trim()} />
      </View>
      {value.length ? (
        <View style={styles.tags}>
          {value.map((v, i) => (
            <View key={`${v}-${i}`} style={styles.tag}>
              <Text variant="caption" color={ink[700]}>{v}</Text>
              <Pressable onPress={() => onChange(value.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove ${v}`} hitSlop={8}><X size={12} color={ink[500]} /></Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: slate[100] },
});
