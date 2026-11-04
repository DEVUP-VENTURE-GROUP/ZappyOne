import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Banknote, Phone, Smartphone } from 'lucide-react-native';
import { useClaimJobPaymentMutation } from '@zappy/core/api';
import { rupeesOf } from '@zappy/core/shared/trackingSteps';
import { upiLink, cleanUpiRef, isUpiRef, helpPhoneFor } from '@zappy/core/shared/upiPay';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { openLink } from '@zappy/ui/lib/openLink';
import { ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { Section } from './Section';

export type PayTo = { amountPaise: number; to: { name: string; upiId: string | null }; reference?: string | null; methods: ('upi' | 'cash')[]; claim: { method: 'upi' | 'cash'; at: string; utr?: string | null } | null; help?: { phone: string; afterMinutes: number } | null };

// The job is done (the website's PayPro): pay the pro directly by UPI or cash, then say so; the pro confirms.
export function PayPro({ jobId, payTo, onClaimed }: { jobId: string; payTo: PayTo; onClaimed: () => void }) {
  const { amountPaise, to, reference } = payTo;
  const [method, setMethod] = useState<'upi' | 'cash'>(payTo.claim?.method || (payTo.methods.includes('upi') ? 'upi' : 'cash'));
  const [claim, { isLoading }] = useClaimJobPaymentMutation();
  const [utr, setUtr] = useState('');
  const [changing, setChanging] = useState(false);
  const amount = rupeesOf(amountPaise);
  const link = to.upiId ? upiLink({ upiId: to.upiId, name: to.name, amountPaise, reference }) : null;

  async function say(m: 'upi' | 'cash') {
    try { toast.success((await claim({ id: jobId, method: m, ...(m === 'upi' && { utr }) }).unwrap()).message); setChanging(false); onClaimed(); }
    catch (err) { toast.error(errText(err, 'Could not send that. Try again.')); }
  }

  const waiting = changing ? null : payTo.claim?.method;
  const helpPhone = helpPhoneFor(payTo.claim, payTo.help);
  return (
    <Section>
      <Text variant="caption" weight="bold" color={ink[400]} style={styles.label}>JOB DONE</Text>
      <Text variant="heading1" weight="extrabold">Pay {to.name} {amount}</Text>
      <Text variant="bodySmall" color={ink[500]}>You pay your pro directly.{reference ? ` Booking ${reference}.` : ''}</Text>

      {waiting ? (
        <View style={styles.wait}>
          <ActivityIndicator size="small" color={zappy[700]} />
          <View style={styles.flex}>
            <Text variant="body" color={zappy[900]}>{waiting === 'upi' ? `Waiting for ${to.name} to confirm your UPI payment${payTo.claim?.utr ? ` (ref ${payTo.claim.utr})` : ''}.` : `Hand ${amount} in cash to ${to.name}. They will confirm it.`}</Text>
            {waiting === 'upi' || link ? (
              <Text variant="bodySmall" weight="semibold" color={zappy[700]} style={styles.switch} onPress={() => (waiting === 'upi' ? say('cash') : (setMethod('upi'), setChanging(true)))} accessibilityRole="button">
                {waiting === 'upi' ? 'Paying cash instead?' : 'Pay by UPI instead?'}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.tiles} accessibilityRole="radiogroup">
            {([['upi', Smartphone, 'UPI', link ? 'Any UPI app' : 'Not added by your pro'], ['cash', Banknote, 'Cash', `Hand it to ${to.name}`]] as const).map(([m, Icon, label, sub]) => {
              const on = method === m;
              const off = m === 'upi' && !link;
              return (
                <Pressable key={m} onPress={() => setMethod(m)} disabled={off} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: off }}
                  style={[styles.tile, on && styles.tileOn, off && styles.off]}>
                  <Icon size={22} color={on ? zappy[700] : ink[500]} />
                  <View style={styles.flex}>
                    <Text variant="body" weight="bold">{label}</Text>
                    <Text variant="caption" color={ink[500]} numberOfLines={1}>{sub}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {method === 'upi' && link ? (
            <View style={styles.gap}>
              <Button label={`Pay ${amount} with a UPI app`} size="large" onPress={() => openLink(link, 'No UPI app opened. Pay to the UPI ID below.')} fullWidth />
              <View style={styles.id}>
                <Text variant="bodySmall" color={ink[500]}>UPI ID</Text>
                <Text variant="body" selectable numberOfLines={1} style={styles.flex}>{to.upiId}</Text>
              </View>
              <Text variant="bodySmall" weight="semibold">UPI reference (12 digits)</Text>
              <TextInput value={utr} onChangeText={(t) => setUtr(cleanUpiRef(t))} keyboardType="number-pad" maxLength={12} placeholder="e.g. 431298765012"
                placeholderTextColor={ink[400]} style={styles.input} accessibilityLabel="UPI reference, 12 digits" />
              <Text variant="caption" color={ink[500]}>In your UPI app, open this payment. The 12-digit UPI ref or UTR number is on the receipt.</Text>
              <Button label={`I've paid ${amount}`} variant="outline" size="large" loading={isLoading} disabled={!isUpiRef(utr)} onPress={() => say('upi')} fullWidth />
            </View>
          ) : null}
          {method === 'cash' ? <Button label={`I'm paying ${amount} in cash`} size="large" loading={isLoading} onPress={() => say('cash')} fullWidth style={styles.mt} /> : null}
        </>
      )}
      {helpPhone ? (
        <View style={styles.help}>
          <Text variant="bodySmall" color={ink[700]}>Not confirmed yet? ZappyOne can help: <Text variant="bodySmall" weight="bold" selectable>{helpPhone}</Text></Text>
          <Button label="Call ZappyOne" variant="outline" icon={<Phone size={16} color={zappy[700]} />} onPress={() => Linking.openURL(`tel:${helpPhone.replace(/\s+/g, '')}`).catch(() => toast(helpPhone))} fullWidth />
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  label: { letterSpacing: 0.8 },
  flex: { flex: 1, minWidth: 0 },
  wait: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.large, backgroundColor: zappy[50] },
  switch: { marginTop: 4, textDecorationLine: 'underline' },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 2, borderColor: slate[200] },
  tileOn: { borderColor: zappy[600], backgroundColor: zappy[50] },
  off: { opacity: 0.5 },
  gap: { gap: spacing.sm, marginTop: spacing.md },
  id: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, backgroundColor: slate[100] },
  mt: { marginTop: spacing.md },
  input: { minHeight: 48, borderWidth: 1, borderColor: slate[200], borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 17, letterSpacing: 1.5, fontFamily: 'Figtree-Regular', color: ink[900] },
  help: { gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200] },
});
