/**
 * Password input with the server's rules shown while typing.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, Circle, Eye, EyeOff } from 'lucide-react-native';
import { passwordChecks } from '@zappy/core/shared/passwordRules';
import { Text } from '..';
import { colors, ink, success } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function PasswordField({ label = 'Password', value, onChange, showRules = false, phone, autoComplete = 'new-password' }: {
  label?: string; value: string; onChange: (v: string) => void; showRules?: boolean; phone?: string; autoComplete?: 'password' | 'new-password' | 'current-password';
}) {
  const [show, setShow] = useState(false);
  const checks: { ok: boolean; label: string }[] = passwordChecks(value, phone);
  return (
    <View style={styles.gapXs}>
      <Text variant="caption" weight="semibold" color={ink[700]}>{label}</Text>
      <View>
        <TextInput value={value} onChangeText={onChange} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} maxLength={72}
          autoComplete={autoComplete} accessibilityLabel={label} style={[styles.input, { paddingRight: 48 }]} />
        <Pressable onPress={() => setShow((s) => !s)} accessibilityLabel={show ? 'Hide password' : 'Show password'} style={styles.eye}>
          {show ? <EyeOff size={17} color={ink[500]} /> : <Eye size={17} color={ink[500]} />}
        </Pressable>
      </View>
      {showRules ? checks.map((c) => (
        <View key={c.label} style={styles.row}>
          {c.ok ? <Check size={13} color={success[700]} /> : <Circle size={11} color={ink[500]} />}
          <Text variant="caption" color={c.ok ? success[700] : ink[500]}>{c.label}</Text>
        </View>
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gapXs: { gap: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  eye: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center' },
});
