/**
 * Ask for the customer's start code when the server wants it, then retry the step
 * (the websites' StartCodePrompt).
 */
import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyRound, X } from 'lucide-react-native';
import { Button, Text } from '..';
import { colors, zappy, ink, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { errText } from '../../lib/feedback';

/**
 * Runs a step; if the server answers "ask for the start code", asks for it
 * and runs the step again with the code (the websites' useStartCodePrompt).
 */
export function useStartCodePrompt() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const pending = useRef<((code?: string) => Promise<unknown>) | null>(null);

  async function run<T>(attempt: (code?: string) => Promise<T>): Promise<T | null> {
    try {
      return await attempt(undefined);
    } catch (err) {
      const c = (err as { data?: { code?: string } })?.data?.code;
      if (c !== 'START_CODE_REQUIRED' && c !== 'START_CODE_INVALID') throw err;
      pending.current = attempt;
      setError(''); setCode(''); setOpen(true);
      return null;
    }
  }

  async function submit() {
    if (!/^[0-9]{4,6}$/.test(code)) { setError('Enter the code the customer reads out'); return; }
    setBusy(true);
    try { await pending.current?.(code); setOpen(false); }
    catch (err) { setError(errText(err, 'That did not work. Try again.')); }
    finally { setBusy(false); }
  }

  const prompt = (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.between}>
            <View style={styles.flex}>
              <View style={styles.row}><KeyRound size={17} color={zappy[600]} /><Text variant="heading3" weight="bold">Ask for the code</Text></View>
              <Text variant="bodySmall" color={ink[700]} style={styles.mtXs}>The customer sees a code in their app. Type what they read out to you.</Text>
            </View>
            <Pressable onPress={() => setOpen(false)} accessibilityLabel="Close" hitSlop={10}><X size={18} color={ink[400]} /></Pressable>
          </View>
          <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad"
            textContentType="oneTimeCode" autoFocus accessibilityLabel="Start code" style={styles.codeInput} />
          {error ? <Text variant="bodySmall" weight="medium" color={danger[600]}>{error}</Text> : null}
          <Button label="Confirm" onPress={submit} loading={busy} fullWidth size="large" />
        </View>
      </View>
    </Modal>
  );
  return { run, prompt };
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  mtXs: { marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.5)', justifyContent: 'center', padding: spacing.base },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.extraLarge, padding: spacing.lg, gap: spacing.base },
  codeInput: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.medium, paddingVertical: spacing.md, textAlign: 'center', fontSize: 30, letterSpacing: 12, fontFamily: 'Figtree-Bold', color: ink[900] },
});
