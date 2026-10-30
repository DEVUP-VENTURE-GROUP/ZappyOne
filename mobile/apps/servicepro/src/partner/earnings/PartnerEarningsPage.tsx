/**
 * What the partner has earned, after ZappyOne's commission (the events
 * website's EarningsPage). Each booking is shown at the rate agreed when it was
 * made, so a later change to the rate never rewrites past earnings.
 */
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Wallet } from 'lucide-react-native';
import { usePartnerEarningsQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { EmptyState, ErrorState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, danger, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { OverviewStat } from '../overview/OverviewStat';
import { usePartner } from '../usePartner';
import { VerifyFirst } from '../VerifyFirst';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

interface Month { _id: { year: number; month: number }; netPaise: number }
interface Recent { _id: string; title: string; eventDate: string; grossPaise: number; commissionPct: number; netPaise: number }

export function PartnerEarningsPage() {
  const router = useRouter();
  const { partner, verified } = usePartner();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerEarningsQuery(undefined, { skip: !verified });
  const header = <ScreenHeader title="Earnings" safeArea />;
  if (!verified) return <View style={styles.page}>{header}<VerifyFirst kycStatus={partner?.kyc?.status} /></View>;
  if (isLoading) return <View style={styles.page}>{header}<LoadingState /></View>;
  if (isError) return <View style={styles.page}>{header}<ErrorState onRetry={refetch} /></View>;

  const d = data || {};
  const pct: number = d.commissionPct ?? 10;
  const monthly: Month[] = [...(d.monthly || [])].reverse();
  const peak = Math.max(1, ...monthly.map((m) => m.netPaise || 0));

  return (
    <View style={styles.page}>
      {header}
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}>
        <Text variant="bodySmall" color={ink[500]}>ZappyOne keeps {pct}% of each booking. You keep {100 - pct}%.</Text>
        <View style={styles.stats}>
          <OverviewStat label="You earned" value={formatPaise(d.netPaise)} hint={`${d.totalJobs || 0} completed events`} />
          <OverviewStat label="Customers paid" value={formatPaise(d.grossPaise)} />
          <OverviewStat label="ZappyOne commission" value={formatPaise(d.platformPaise)} />
          <OverviewStat label="Coming up" value={formatPaise(d.upcomingNetPaise)} hint={`${d.upcomingCount || 0} accepted bookings`} />
        </View>
        {/* Penalties for cancelled bookings come off what you are paid (server events/partner-cancel). */}
        {d.penaltiesPaise > 0 ? (
          <Text variant="bodySmall" color={danger[600]}>Cancellation penalties: {formatPaise(d.penaltiesPaise)}, taken from your payouts. After penalties you earned {formatPaise(d.netAfterPenaltiesPaise)}.</Text>
        ) : null}

        {!d.totalJobs ? <EmptyState icon={<Wallet size={40} color={slate[300]} />} title="No earnings yet" message="Your share of each event shows here once you mark it completed." /> : (
          <>
            <View style={styles.card}>
              <Text variant="bodySmall" weight="bold">Last {monthly.length} month{monthly.length === 1 ? '' : 's'}</Text>
              <View style={styles.chart} accessibilityRole="image" accessibilityLabel="Monthly earnings">
                {monthly.map((m) => (
                  <View key={`${m._id.year}-${m._id.month}`} style={styles.col}>
                    <Text variant="caption" color={ink[500]} style={styles.tiny}>{formatPaise(m.netPaise)}</Text>
                    <View style={[styles.bar, { height: `${Math.max(4, (m.netPaise / peak) * 100)}%` }]} />
                    <Text variant="caption" color={ink[500]}>{MONTHS[m._id.month - 1]}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.card}>
              <Text variant="bodySmall" weight="bold">Recent events</Text>
              {(d.recent || []).map((r: Recent) => (
                <Pressable key={r._id} onPress={() => router.push(`/partner/bookings/${r._id}` as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.recent}>
                  <View style={styles.flex}>
                    <Text variant="bodySmall" weight="semibold" numberOfLines={1}>{r.title}</Text>
                    <Text variant="caption" color={ink[500]}>{shortDate(r.eventDate)}, paid {formatPaise(r.grossPaise)}, {r.commissionPct}%</Text>
                  </View>
                  <Text variant="bodySmall" weight="bold">{formatPaise(r.netPaise)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <Text variant="caption" color={ink[400]}>Payouts to your bank are being set up. Your earnings are recorded against every completed event.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base, paddingBottom: spacing.xxl },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 160 },
  col: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '70%', borderRadius: 4, backgroundColor: zappy[500] },
  tiny: { fontSize: 9 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  flex: { flex: 1 },
});
