/**
 * Pick the repair for a quote from the vertical's catalog (the website's RepairPicker).
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components';
import { colors, ink, slate } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';

export function RepairPicker({ value, options, onChange, placeholder }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.select} accessibilityRole="button">
        <Text variant="bodySmall" color={current ? ink[900] : ink[400]} style={styles.flex}>{current?.label || placeholder}</Text>
      </Pressable>
      {open ? (
        <View style={styles.options}>
          <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
            {options.map((o) => (
              <Pressable key={o.value} onPress={() => { onChange(o.value); setOpen(false); }} style={styles.option}>
                <Text variant="bodySmall" weight={o.value === value ? 'bold' : 'regular'}>{o.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  select: { minHeight: 44, minWidth: 92, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, justifyContent: 'center', backgroundColor: colors.surface },
  options: { marginTop: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: colors.surface },
  option: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: slate[100] },
});
