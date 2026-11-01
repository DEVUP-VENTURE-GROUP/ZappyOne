/**
 * Pay what is owed to ZappyOne (the websites' PayDuesButton): opens Razorpay's
 * own payment page, then checks the moment the partner comes back to the app.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useCheckDuesLinkMutation, useCreateDuesLinkMutation, useGetPaymentAvailabilityQuery } from '@zappy/core/api';
import { Button, Text } from '../components';
import { toast } from '../components/Toast';
import { errText } from '../lib/feedback';
import { openLink } from '../lib/openLink';
import { ink, zappy } from '../theme/colors';
import { spacing } from '../theme/spacing';

const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

export function PayDuesButton({ duesPaise, onPaid }: { duesPaise: number; onPaid?: () => void }) {
  const { data: avail } = useGetPaymentAvailabilityQuery(undefined);
  const [create, { isLoading: opening }] = useCreateDuesLinkMutation();
  const [check, { isLoading: checking }] = useCheckDuesLinkMutation();
  const [pending, setPending] = useState<string | null>(null);
  const asked = useRef(false);

  async function verify(id: string, quiet = false) {
    try {
      const r = await check(id).unwrap();
      if (r?.ok) { setPending(null); toast.success('Paid. You can take new jobs.'); onPaid?.(); }
      else if (!quiet) toast('Not paid yet. Finish on the Razorpay page, then check again.');
    } catch (err) { if (!quiet) toast.error(errText(err, 'Could not check the payment. Try again.')); }
  }

  useEffect(() => {
    if (!pending) return undefined;
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && asked.current) verify(pending, true); });
    return () => sub.remove();
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  if (avail?.gateway !== 'razorpay' || !(duesPaise > 0)) return null;

  async function pay() {
    try {
      const r = await create({}).unwrap();
      setPending(r.cfOrderId);
      asked.current = true;
      openLink(r.url, 'The payment page could not be opened. Try again.');
    } catch (err) { toast.error(errText(err, 'Could not start the payment. Try again.')); }
  }

  return (
    <View style={styles.wrap}>
      <Button label={`Pay ${rupees(duesPaise)} now`} onPress={pay} loading={opening} fullWidth />
      {pending ? (
        <Text variant="bodySmall" weight="semibold" color={zappy[700]} style={styles.center} onPress={() => verify(pending)} accessibilityRole="button">
          {checking ? 'Checking…' : 'Paid on Razorpay? Check now'}
        </Text>
      ) : <Text variant="caption" color={ink[500]} style={styles.center}>UPI, card or net banking on Razorpay's secure page</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, alignSelf: 'stretch' },
  center: { textAlign: 'center' },
});
