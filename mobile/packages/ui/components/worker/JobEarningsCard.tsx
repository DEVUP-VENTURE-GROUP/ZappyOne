/**
 * What the provider earned on a finished job, line by line (the websites' JobEarningsCard).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { useJobEarningsQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Skeleton, Text } from '..';
import { ink, slate, success } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { JobCard, Eyebrow } from '../jobs/JobCard';

type Line = { label: string; paise: number; note?: string };

function Block({ title, total, rows, you }: { title: string; total: number; rows: Line[]; you?: boolean }) {
  return (
    <View style={[styles.block, you ? styles.blockYou : null]}>
      <View style={styles.between}>
        <Text variant="bodySmall" weight="bold" color={you ? success[700] : ink[900]}>{title}</Text>
        <Text variant="body" weight="black" color={you ? success[700] : ink[900]}>{formatPaise(total)}</Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.between}>
          <View style={styles.flex}>
            <Text variant="caption" color={ink[700]}>{r.label}</Text>
            {r.note ? <Text variant="caption" color={ink[400]}>{r.note}</Text> : null}
          </View>
          <Text variant="caption" weight="semibold">{r.paise < 0 ? `− ${formatPaise(-r.paise)}` : formatPaise(r.paise)}</Text>
        </View>
      ))}
    </View>
  );
}

/* After the job: what the customer paid, what ZappyOne keeps, what is theirs. */
export function JobEarningsCard({ jobId }: { jobId: string }) {
  const { data, isLoading } = useJobEarningsQuery(jobId);
  const e = data?.earnings;
  if (isLoading) return <Skeleton height={160} />;
  if (!e) return null;
  return (
    <JobCard>
      <View style={styles.row}><Wallet size={14} color={ink[500]} /><Eyebrow>PAYMENT BREAKDOWN</Eyebrow></View>
      <Block title="Customer paid" total={e.customerPaidPaise} rows={e.bill} />
      <Block title="ZappyOne keeps" total={e.zappyKeepsPaise} rows={e.zappy} />
      <Block title="You earn" total={e.youEarnPaise} rows={e.yours} you />
      <Text variant="caption" color={ink[700]}>
        {e.cash
          ? `You collected ${formatPaise(e.customerPaidPaise)} in cash. ZappyOne's ${formatPaise(e.zappyKeepsPaise)} comes off your wallet, so you keep ${formatPaise(e.youEarnPaise)}.`
          : `The customer paid online. Your ${formatPaise(e.youEarnPaise)} goes to your wallet.`}
      </Text>
    </JobCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  block: { backgroundColor: slate[50], borderRadius: radius.button, padding: spacing.md, gap: 6 },
  blockYou: { backgroundColor: success[50], borderWidth: 1, borderColor: success[100] },
});
