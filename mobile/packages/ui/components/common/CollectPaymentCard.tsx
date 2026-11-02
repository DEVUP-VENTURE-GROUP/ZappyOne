/**
 * What to collect from the customer, and recording it once paid
 * (the websites' CollectPaymentCard).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, Heart } from 'lucide-react-native';
import { useReportCashRefusedMutation } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '..';
import { toast } from '../Toast';
import { errText } from '../../lib/feedback';
import { ink, success, danger, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { JobCard } from '../jobs/JobCard';

// "Customer did not pay", with a confirm step; the same control on every kind of job (server: jobs/give-back reportCashRefused).
export function CashRefusedControl({ jobId }: { jobId: string }) {
  const [asking, setAsking] = useState(false);
  const [report, { isLoading }] = useReportCashRefusedMutation();
  async function send() {
    try { toast.success((await report({ id: jobId }).unwrap()).message); setAsking(false); }
    catch (err) { toast.error(errText(err, 'Could not send the report')); }
  }
  if (!asking) {
    return <Text variant="bodySmall" weight="semibold" color={ink[500]} style={styles.link} onPress={() => setAsking(true)} accessibilityRole="button">Customer did not pay</Text>;
  }
  return (
    <View style={styles.unpaid}>
      <Text variant="bodySmall" weight="semibold" color={danger[600]}>Report that the customer did not pay? They are told, their next booking waits until it is paid, and ZappyOne follows up.</Text>
      <View style={styles.row}>
        <Button label="Yes, report" variant="danger" size="small" loading={isLoading} onPress={send} />
        <Button label="Cancel" variant="outline" size="small" onPress={() => setAsking(false)} />
      </View>
    </View>
  );
}

const timeOf = (d: string | Date) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/* The money step (the websites' CollectPaymentCard): the customer pays the pro directly by UPI or cash, may tap "I've paid", and the pro taps Received. */
export function CollectPaymentCard({ amountPaise, paymentMethod, paid, collecting, onCollect, tipPaise = 0, carriedPaise = 0, jobId, claim }: {
  amountPaise: number; paymentMethod?: string; paid?: boolean; collecting?: boolean; onCollect: () => void; what?: string; tipPaise?: number; carriedPaise?: number; jobId?: string;
  claim?: { method?: 'upi' | 'cash'; at?: string } | null;
}) {
  if (!amountPaise || amountPaise <= 0) return null;
  const amount = formatPaise(amountPaise);
  const tip = tipPaise > 0 ? (
    <View style={styles.tip}><Heart size={13} color={danger[500]} fill={danger[500]} />
      <Text variant="caption" weight="bold" color={danger[600]}>Includes a {formatPaise(tipPaise)} tip from the customer. All yours.</Text></View>
  ) : null;
  if (paid) {
    const how = paymentMethod === 'online' ? 'paid online' : claim?.method === 'upi' ? 'received by UPI' : 'received';
    return (
      <JobCard tone="green">
        <View style={styles.row}><Check size={15} color={success[700]} /><Text variant="body" weight="bold" color={success[700]}>{amount} {how}</Text></View>
        {tip}
      </JobCard>
    );
  }
  return (
    <JobCard>
      <Text variant="heading3" weight="extrabold">Collect {amount}</Text>
      <Text variant="bodySmall" color={ink[500]} style={styles.mtXs}>
        {`The customer pays you by UPI or cash. Tap Received once the money is with you.${carriedPaise > 0 ? ` It includes ${formatPaise(carriedPaise)} they owed from an earlier cancelled booking.` : ''}`}
      </Text>
      {claim?.method ? (
        <View style={styles.claim}>
          <Text variant="bodySmall" weight="semibold" color={zappy[800]}>
            {claim.method === 'upi' ? `The customer says they paid ${amount} by UPI${claim.at ? ` at ${timeOf(claim.at)}` : ''}. Check your UPI app first.` : `The customer is paying ${amount} in cash.`}
          </Text>
        </View>
      ) : null}
      {tip}
      <Button label={`Received ${amount}`} onPress={onCollect} loading={collecting} fullWidth size="large" style={styles.mtSm} />
      {jobId ? <CashRefusedControl jobId={jobId} /> : null}
    </JobCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mtXs: { marginTop: 2 },
  mtSm: { marginTop: spacing.sm },
  link: { textAlign: 'center', paddingVertical: spacing.xs, marginTop: spacing.sm },
  unpaid: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, backgroundColor: danger[50], marginTop: spacing.sm },
  claim: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.medium, backgroundColor: zappy[50] },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: danger[50], borderRadius: radius.button, paddingHorizontal: spacing.sm, paddingVertical: 6, marginTop: spacing.sm },
});
