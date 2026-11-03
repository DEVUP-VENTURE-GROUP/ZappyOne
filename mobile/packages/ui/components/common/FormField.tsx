/**
 * A labelled text input and the small uppercase label used above form fields.
 */
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from '..';
import { colors, danger, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export const FieldLabel = ({ children }: { children: string }) => <Text variant="caption" weight="black" color={ink[400]}>{children}</Text>;

/** `error`: shown under the field in red, and the border turns red. */
export function FormField({ label, error, ...props }: { label: string; error?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.gapXs}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput placeholderTextColor={ink[400]} style={[styles.input, error ? styles.inputError : null]} accessibilityHint={error || undefined} {...props} />
      {error ? <Text variant="caption" weight="semibold" color={danger[600]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gapXs: { gap: 6 },
  inputError: { borderColor: danger[600] },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-SemiBold', color: ink[900], backgroundColor: colors.surface },
});
