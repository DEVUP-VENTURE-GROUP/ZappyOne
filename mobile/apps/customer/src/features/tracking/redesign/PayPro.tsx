import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Banknote, Smartphone } from 'lucide-react-native';
import { useClaimJobPaymentMutation } from '@zappy/core/api';
import { rupeesOf } from '@zappy/core/shared/trackingSteps';
import { upiLink } from '@zappy/core/shared/upiPay';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { openLink } from '@zappy/ui/lib/openLink';
import { ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { Section } from './Section';

export type PayTo = { amountPaise: number; to: { name: string; upiId: string | null }; reference?: string | null; methods: ('upi' | 'cash')[]; claim: { method: 'upi' | 'cash'; at: string } | null };

// The job is done (the website's PayPro): pay the pro directly by UPI or cash, then say so; the pro confirms.
export function PayPro({ jobId, payTo, onClaimed }: { jobId: string; payTo: PayTo; onClaimed: () => void }) {
  const { amountPaise, to, reference } = payTo;
  const [method, setMethod] = useState<'upi' | 'cash'>(payTo.claim?.method || (payTo.methods.includes('upi') ? 'upi' : 'cash'));
  const [claim, { isLoading }] = useClaimJobPaymentMutation();
  const amount = rupeesOf(amountPaise);
  const link = to.upiId ? upiLink({ upiId: to.upiId, name: to.name, amountPaise, reference }) : null;

  async function say(m: 'upi' | 'cash') {
    try { toast.success((await claim({ id: jobId, method: m }).unwrap()).message); onClaimed(); }
    catch (err) { toast.error(errText(err, 'Could not send that. Try again.')); }
  }

  const waiting = payTo.claim?.method;
  return (
    <Section>
      <Text variant="caption" weight="bold" color={ink[400]} style={styles.label}>JOB DONE</Text>
      <Text variant="heading1" weight="extrabold">Pay {to.name} {amount}</Text>
      <Text variant="bodySmall" color={ink[500]}>You pay your pro directly.{reference ? ` Booking ${reference}.` : ''}</Text>

      {waiting ? (
        <View style={styles.wait}>
          <ActivityIndicator size="small" color={zappy[700]} />
          <View style={styles.flex}>
            <Text variant="body" color={zappy[900]}>{waiting === 'upi' ? `Waiting for ${to.name} to confirm your UPI payment.` : `Hand ${amount} in cash to ${to.name}. They will confirm it.`}</Text>
            {waiting === 'upi' || link ? (
              <Text variant="bodySmall" weight="semibold" color={zappy[700]} style={styles.switch} onPress={() => say(waiting === 'upi' ? 'cash' : 'upi')} accessibilityRole="button">
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
              <Button label={`I've paid ${amount}`} variant="outline" size="large" loading={isLoading} onPress={() => say('upi')} fullWidth />
            </View>
          ) : null}
          {method === 'cash' ? <Button label={`I'm paying ${amount} in cash`} size="large" loading={isLoading} onPress={() => say('cash')} fullWidth style={styles.mt} /> : null}
        </>
      )}
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
});
