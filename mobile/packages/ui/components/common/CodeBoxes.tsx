/**
 * A row of boxes for typing a short numeric code.
 */
import React, { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyRound } from 'lucide-react-native';
import { Text } from '..';
import { colors, ink, accent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

/* Six boxes over one hidden field: the customer's handover or start code. */
export function CodeBoxes({ value, onChange, length = 6, title, hint }: { value: string; onChange: (v: string) => void; length?: number; title: string; hint: string }) {
  const ref = useRef<TextInput>(null);
  return (
    <View style={styles.codeWrap}>
      <View style={styles.row}>
        <View style={[styles.circleSm, { backgroundColor: accent[50] }]}><KeyRound size={15} color={accent[600]} /></View>
        <View style={styles.flex}>
          <Text variant="caption" weight="extrabold" color={accent[700]}>{title.toUpperCase()}</Text>
          <Text variant="caption" color={ink[500]}>{hint}</Text>
        </View>
      </View>
      <Pressable onPress={() => ref.current?.focus()} style={styles.boxes} accessibilityLabel={`${title}, ${value.length} of ${length} digits`}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={[styles.box, value[i] ? styles.boxOn : null]}>
            <Text variant="heading2" weight="black" color={value[i] ? accent[700] : ink[300]}>{value[i] ? '●' : '–'}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput ref={ref} value={value} onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={length} autoFocus style={styles.hidden} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  circleSm: { width: 32, height: 32, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  codeWrap: { gap: spacing.md },
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  box: { flex: 1, maxWidth: 52, aspectRatio: 1, borderRadius: radius.medium, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  boxOn: { borderColor: accent[500], backgroundColor: accent[50] },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
