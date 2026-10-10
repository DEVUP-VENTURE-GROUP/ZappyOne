/**
 * First sign-in for a provider (the websites' WorkerOnboarding): their name,
 * then an optional emergency contact. Then on to choosing services.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CheckCircle2, Heart, Phone, ShieldCheck, User } from 'lucide-react-native';
import { useWorkerCompleteOnboardingMutation, useGetWorkerMeQuery } from '@zappy/core/api';
import { Button, Input, Text } from '../../components';
import { toast } from '../../components/Toast';
import { ZappyWordmark } from '../../components/ZappyLogo';
import { colors, zappy, ink, slate, success, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { errText } from '../../lib/feedback';

export function WorkerOnboarding({ onComplete }: { onComplete?: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: meData } = useGetWorkerMeQuery(undefined);
  const [complete, { isLoading }] = useWorkerCompleteOnboardingMutation();
  const [step, setStep] = useState(0);
  const [name, setName] = useState<string>(meData?.worker?.name ?? '');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const phone = meData?.worker?.phone ?? '';
  const ecDigits = ecPhone.replace(/\D/g, '');
  const ecValid = ecDigits.length === 0 || /^[6-9]\d{9}$/.test(ecDigits);

  async function finish(withContact: boolean) {
    if (withContact && !ecValid) { toast.error('Enter a valid 10-digit mobile number'); return; }
    try {
      await complete({
        name: name.trim(),
        ...(withContact && (ecName.trim() || ecDigits) ? { emergencyContact: { name: ecName.trim(), phone: ecDigits } } : {}),
      }).unwrap();
      onComplete?.();
      router.replace('/provider/onboarding' as never);
    } catch (err) {
      toast.error(errText(err, 'Setup failed'));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.between}>
          <ZappyWordmark size={22} />
          <Text variant="bodySmall" weight="semibold" color={colors.textSecondary}>Step {step + 1} of 2</Text>
        </View>
        <View style={styles.steps}>{[0, 1].map((i) => <View key={i} style={[styles.step, { backgroundColor: i <= step ? zappy[600] : slate[200] }]} />)}</View>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            <View style={[styles.badge, { backgroundColor: zappy[50] }]}><User size={20} color={zappy[600]} /></View>
            <Text variant="heading1" weight="bold">What's your name?</Text>
            <Text variant="body" color={colors.textSecondary}>Customers see this when you're assigned to their job.</Text>
            <Input label="Full name" placeholder="e.g. Ravi Kumar" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" autoFocus />
            <View>
              <Text variant="label" style={styles.label}>Mobile number</Text>
              <View style={styles.phone}>
                <Phone size={16} color={ink[400]} />
                <Text variant="body" weight="semibold">{phone}</Text>
                <View style={styles.verified}><CheckCircle2 size={12} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>Verified</Text></View>
              </View>
            </View>
            <View style={styles.note}>
              <ShieldCheck size={17} color={zappy[600]} />
              <Text variant="bodySmall" color={ink[700]} style={styles.flex}>
                Next you'll choose what you work on: phones, laptops and more. Each one is verified separately, so customers know exactly what you're qualified for.
              </Text>
            </View>
            <Button label="Continue" onPress={() => setStep(1)} disabled={name.trim().length < 2} size="large" fullWidth />
          </>
        ) : (
          <>
            <View style={[styles.badge, { backgroundColor: danger[50] }]}><Heart size={20} color={danger[600]} /></View>
            <Text variant="heading1" weight="bold">Emergency contact</Text>
            <Text variant="body" color={colors.textSecondary}>Who should we call if something happens on a job? Optional, but strongly recommended.</Text>
            <Input label="Contact name" placeholder="e.g. Wife, Mother, Friend" value={ecName} onChangeText={setEcName} autoCapitalize="words" />
            <Input label="Contact phone" placeholder="10-digit mobile number" value={ecPhone} onChangeText={setEcPhone} keyboardType="phone-pad"
              error={ecValid ? undefined : "That doesn't look like an Indian mobile number."} />
            <View style={styles.row}>
              <Button label="Back" variant="outline" onPress={() => setStep(0)} />
              <Button label={isLoading ? 'Setting up…' : 'Continue'} onPress={() => finish(true)} loading={isLoading} disabled={!ecValid} style={styles.flex} />
            </View>
            <Button label="Skip for now" variant="ghost" onPress={() => finish(false)} disabled={isLoading} fullWidth />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: spacing.sm },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  steps: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  step: { flex: 1, height: 4, borderRadius: radius.pill },
  body: { padding: spacing.lg, gap: spacing.base },
  badge: { width: 44, height: 44, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  label: { marginBottom: 6 },
  phone: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', backgroundColor: success[50], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  note: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.md },
});
