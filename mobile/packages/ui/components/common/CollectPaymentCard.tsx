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
import { ink, success, danger } from '../../theme/colors';
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

/* The money step: collect cash and record it, or wait for the online payment. */
export function CollectPaymentCard({ amountPaise, paymentMethod, paid, collecting, onCollect, what = 'payment', tipPaise = 0, carriedPaise = 0, jobId }: {
  amountPaise: number; paymentMethod?: string; paid?: boolean; collecting?: boolean; onCollect: () => void; what?: string; tipPaise?: number; carriedPaise?: number; jobId?: string;
}) {
  if (!amountPaise || amountPaise <= 0) return null;
  const amount = formatPaise(amountPaise);
  const tip = tipPaise > 0 ? (
    <View style={styles.tip}><Heart size={13} color={danger[500]} fill={danger[500]} />
      <Text variant="caption" weight="bold" color={danger[600]}>Includes a {formatPaise(tipPaise)} tip from the customer. All yours.</Text></View>
  ) : null;
  if (paid) {
    return (
      <JobCard tone="green">
        <View style={styles.row}><Check size={15} color={success[700]} /><Text variant="bodySmall" weight="bold" color={success[700]}>{amount} {paymentMethod === 'cash' ? 'collected in cash' : 'paid online'}</Text></View>
        {tip}
      </JobCard>
    );
  }
  const cash = paymentMethod === 'cash';
  return (
    <JobCard tone="amber">
      <Text variant="body" weight="bold">{cash ? `Collect ${amount} in cash` : `Waiting for ${amount} online`}</Text>
      <Text variant="caption" color={ink[700]} style={styles.mtXs}>
        {cash
          ? `Take the ${what} from the customer, then record it here. The platform's share is deducted from your wallet.${carriedPaise > 0 ? ` This includes ${formatPaise(carriedPaise)} the customer owed from an earlier cancelled booking; it comes off your wallet too.` : ''}`
          : 'The customer chose to pay online and can pay from their booking screen. If they cannot, take cash and record it here.'}
      </Text>
      {tip}
      <Button label={`I've collected ${amount} in cash`} variant={cash ? 'primary' : 'outline'} onPress={onCollect} loading={collecting} fullWidth style={styles.mtSm} />
      {cash && jobId ? <CashRefusedControl jobId={jobId} /> : null}
    </JobCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mtXs: { marginTop: 2 },
  mtSm: { marginTop: spacing.sm },
  link: { textAlign: 'center', paddingVertical: spacing.xs, marginTop: spacing.sm },
  unpaid: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, backgroundColor: danger[50], marginTop: spacing.sm },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: danger[50], borderRadius: radius.button, paddingHorizontal: spacing.sm, paddingVertical: 6, marginTop: spacing.sm },
});
