/**
 * A labelled text input and the small uppercase label used above form fields.
 */
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from '..';
import { colors, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export const FieldLabel = ({ children }: { children: string }) => <Text variant="caption" weight="black" color={ink[400]}>{children}</Text>;

export function FormField({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.gapXs}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput placeholderTextColor={ink[400]} style={styles.input} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  gapXs: { gap: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-SemiBold', color: ink[900], backgroundColor: colors.surface },
});
