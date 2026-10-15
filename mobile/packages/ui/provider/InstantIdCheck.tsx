/**
 * Verify identity in a minute (Aadhaar by a code to its linked mobile, and PAN)
 * instead of waiting for a person. Shown only when ZappyOne has an instant-check
 * provider; otherwise the uploaded documents are reviewed by the team.
 */
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AlertTriangle, BadgeCheck, ShieldCheck } from 'lucide-react-native';
import {
  useProviderIdCheckQuery,
  useStartAadhaarCheckMutation,
  useSubmitAadhaarOtpMutation,
  useVerifyPanCheckMutation,
} from '@zappy/core/api';
import { Button, Text } from '../components';
import { toast } from '../components/Toast';
import { errText } from '../lib/feedback';
import { colors, ink, success, accent } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

/** Verify identity in a minute when ZappyOne has an instant-check provider; otherwise not shown. */
export function InstantIdCheck() {
  const { data } = useProviderIdCheckQuery();
  const [start, { isLoading: starting }] = useStartAadhaarCheckMutation();
  const [submit, { isLoading: submitting }] = useSubmitAadhaarOtpMutation();
  const [panCheck, { isLoading: panning }] = useVerifyPanCheckMutation();
  const [aadhaar, setAadhaar] = useState('');
  const [checkId, setCheckId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [pan, setPan] = useState('');
  if (!data?.instant) return null;
  const aOk = data.aadhaar?.status === 'verified';
  const pOk = data.pan?.status === 'verified';

  async function sendCode() {
    try { const r = await start({ aadhaar: aadhaar.replace(/\s/g, '') }).unwrap(); setCheckId(r.checkId); toast.success(r.message); }
    catch (err) { toast.error(errText(err, 'Could not start the check')); }
  }
  async function confirm() {
    try {
      const r = await submit({ checkId, otp }).unwrap();
      setCheckId(null); setOtp(''); setAadhaar('');
      if (r.status === 'verified') toast.success(r.message); else toast(r.message);
    } catch (err) { toast.error(errText(err, 'That code did not work')); }
  }
  async function checkPan() {
    try { const r = await panCheck({ pan: pan.toUpperCase() }).unwrap(); if (r.status === 'verified') toast.success(r.message); else toast(r.message); }
    catch (err) { toast.error(errText(err, 'Could not check the PAN')); }
  }

  return (
    <View style={[styles.card, { borderColor: success[100], borderWidth: 2, backgroundColor: success[50] }]}>
      <View style={styles.row}><ShieldCheck size={17} color={success[700]} /><Text variant="bodySmall" weight="black" color={success[700]}>Verify your ID instantly</Text></View>
      <Text variant="caption" color={success[700]}>Skip the wait: a code to the mobile linked to your Aadhaar. We keep only its last 4 digits.</Text>
      <View style={styles.card}>
        <Text variant="bodySmall" weight="bold">Aadhaar</Text>
        {aOk ? (
          <View style={styles.row}><BadgeCheck size={14} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>Verified, ••••{data.aadhaar.last4}, {data.aadhaar.nameOnId}</Text></View>
        ) : (
          <>
            {data.aadhaar?.status === 'mismatch' ? (
              <View style={[styles.row, { alignItems: 'flex-start' }]}><AlertTriangle size={13} color={accent[700]} /><Text variant="caption" color={accent[700]} style={styles.flex}>The name on Aadhaar ({data.aadhaar.nameOnId}) differs from your account. Our team will check it.</Text></View>
            ) : null}
            {!checkId ? (
              <View style={styles.row}>
                <TextInput value={aadhaar} onChangeText={(v) => setAadhaar(v.replace(/[^\d\s]/g, '').slice(0, 14))} keyboardType="number-pad" placeholder="12-digit Aadhaar number" placeholderTextColor={ink[400]} style={[styles.input, styles.flex]} />
                <Button label="Send code" variant="success" onPress={sendCode} loading={starting} disabled={aadhaar.replace(/\s/g, '').length !== 12} />
              </View>
            ) : (
              <View style={styles.row}>
                <TextInput value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoFocus placeholder="6-digit code" placeholderTextColor={ink[400]} style={[styles.input, styles.flex]} />
                <Button label="Verify" variant="success" onPress={confirm} loading={submitting} disabled={otp.length !== 6} />
              </View>
            )}
          </>
        )}
      </View>
      <View style={styles.card}>
        <Text variant="bodySmall" weight="bold">PAN <Text variant="caption" color={ink[400]}>(needed for payouts above ₹20,000 a month)</Text></Text>
        {pOk ? (
          <View style={styles.row}><BadgeCheck size={14} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>Verified, {data.pan.pan}, {data.pan.nameOnId}</Text></View>
        ) : (
          <View style={styles.row}>
            <TextInput value={pan} onChangeText={(v) => setPan(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} autoCapitalize="characters" placeholder="ABCDE1234F" placeholderTextColor={ink[400]} style={[styles.input, styles.flex]} />
            <Button label="Check" variant="outline" onPress={checkPan} loading={panning} disabled={pan.length !== 10} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
});
