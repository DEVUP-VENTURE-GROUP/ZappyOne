/**
 * Sensitive changes (bank details, payouts) need a fresh OTP: the server
 * answers OTP_REQUIRED when the last one is over 10 minutes old. This asks for
 * the code once, then runs the action again (the websites' useOtpGate).
 *
 *   const otp = useOtpGate();
 *   await otp.run(() => addBank(body).unwrap());
 *   …
 *   {otp.modal}
 */
import React, { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ShieldCheck, X } from 'lucide-react-native';
import { useRequestActionOtpMutation, useVerifyActionOtpMutation } from '@zappy/core/api';
import type { ApiErr } from '../../lib/feedback';
import { colors, ink, success } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { Button } from '../Button';
import { Text } from '../Text';
import { toast } from '../Toast';
import { errText } from '../../lib/feedback';

export function useOtpGate() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  // The server sends to the signed-in account's own number.
  const [requestOtp, { isLoading: sending }] = useRequestActionOtpMutation();
  const [verify, { isLoading: verifying }] = useVerifyActionOtpMutation();
  const pending = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);

  const close = () => { setOpen(false); setCode(''); setSent(false); pending.current?.reject(new Error('cancelled')); pending.current = null; };

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if ((err as ApiErr)?.data?.code !== 'OTP_REQUIRED') throw err;
      // Ask for the code, then try the same action again.
      await new Promise<void>((resolve, reject) => { pending.current = { resolve, reject }; setOpen(true); });
      return fn();
    }
  }, []);

  async function send() {
    try {
      const r = await requestOtp(undefined).unwrap();
      setSent(true);
      toast.success(r?.sentTo ? `Code sent to ${r.sentTo}` : 'Code sent');
    } catch (err) { toast.error(errText(err, 'Could not send the code')); }
  }
  async function confirm() {
    try {
      await verify({ otp: code }).unwrap();
      const p = pending.current; pending.current = null;
      setOpen(false); setCode(''); setSent(false);
      p?.resolve();
    } catch (err) { toast.error(errText(err, 'That code did not work')); }
  }

  const modal = (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.between}>
            <View style={styles.row}><ShieldCheck size={18} color={success[600]} /><Text variant="body" weight="bold">Confirm it is you</Text></View>
            <Pressable onPress={close} accessibilityLabel="Close" hitSlop={10}><X size={18} color={ink[400]} /></Pressable>
          </View>
          <Text variant="caption" color={ink[500]}>Money details are protected. We send a code to your registered number.</Text>
          {!sent ? (
            <Button label="Send code" onPress={send} loading={sending} fullWidth />
          ) : (
            <View style={styles.row}>
              <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode"
                autoFocus placeholder="Code" placeholderTextColor={ink[400]} accessibilityLabel="Code" style={styles.code} />
              <Button label="Confirm" variant="success" onPress={confirm} loading={verifying} disabled={code.length < 4} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  return { run, modal };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.5)', justifyContent: 'flex-end', padding: spacing.md },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.extraLarge, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: radius.medium, paddingVertical: spacing.sm, textAlign: 'center', fontSize: 20, letterSpacing: 8, fontFamily: 'Figtree-Bold', color: ink[900] },
});
