/**
 * Earnings (the websites' WorkerEarningsPage): total net for a period, jobs,
 * tips and surge jobs, then every job with its breakdown (gross, platform fee,
 * tip, bonus, surge, net). The payslip is shared as CSV, as the web downloads it.
 */
import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Share, StyleSheet, View } from 'react-native';
import { BarChart2, ChevronDown, ChevronUp, Info, Share2, TrendingUp, Zap } from 'lucide-react-native';
import { useGetJobEarningsQuery } from '@zappy/core/api';
import { EmptyState, ScreenHeader, SkeletonList, Text } from '../../components';
import { colors, zappy, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const fmt = (v: number) => `₹${((v || 0) / 100).toFixed(2)}`;

const PERIODS = [{ id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }, { id: '3months', label: '3 months' }];

type Job = { _id: string; serviceLabel?: string; completedAt: string; gross: number; platformFee: number; tip: number; bonus: number; net: number; surgeMultiplier?: number; orderId?: string };

function payslipCsv(jobs: Job[]) {
  const rows = [['Date', 'Service', 'Gross', 'Platform Fee', 'Tip', 'Bonus', 'Surge', 'Net']];
  jobs.forEach((j) => rows.push([
    new Date(j.completedAt).toLocaleDateString('en-IN'), j.serviceLabel ?? 'Service', (j.gross / 100).toFixed(2),
    (j.platformFee / 100).toFixed(2), (j.tip / 100).toFixed(2), (j.bonus / 100).toFixed(2), String(j.surgeMultiplier ?? 1), (j.net / 100).toFixed(2),
  ]));
  return rows.map((r) => r.join(',')).join('\n');
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.line}>
      <Text variant="bodySmall" color={colors.textSecondary}>{label}</Text>
      <Text variant="bodySmall" weight="bold" color={tone ?? ink[900]}>{value}</Text>
    </View>
  );
}

function EarningRow({ job, open, onToggle }: { job: Job; open: boolean; onToggle: () => void }) {
  const surge = (job.surgeMultiplier ?? 1) > 1;
  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.rowHead}>
        <View style={[styles.icon, { backgroundColor: surge ? accent[100] : zappy[50] }]}>
          {surge ? <Zap size={18} color={accent[600]} /> : <TrendingUp size={18} color={zappy[600]} />}
        </View>
        <View style={styles.flex}>
          <Text variant="body" weight="bold" numberOfLines={1}>{job.serviceLabel ?? 'Service'}</Text>
          <Text variant="caption" color={ink[400]}>{new Date(job.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
        </View>
        <View style={styles.right}>
          <Text variant="heading3" weight="black">{fmt(job.net)}</Text>
          {surge ? <View style={styles.surgeTag}><Text variant="caption" weight="extrabold" color={accent[700]}>{job.surgeMultiplier}×</Text></View> : null}
        </View>
        {open ? <ChevronUp size={16} color={zappy[400]} /> : <ChevronDown size={16} color={ink[300]} />}
      </Pressable>
      {open ? (
        <View style={styles.breakdown}>
          <Line label="Gross earnings" value={fmt(job.gross)} />
          <Line label="Platform fee" value={`-${fmt(job.platformFee)}`} tone={danger[500]} />
          {job.tip > 0 ? <Line label="Customer tip" value={`+${fmt(job.tip)}`} tone={success[600]} /> : null}
          {job.bonus > 0 ? <Line label="Bonus" value={`+${fmt(job.bonus)}`} tone={success[600]} /> : null}
          {surge ? <Line label="Surge multiplier" value={`${job.surgeMultiplier}×`} tone={accent[600]} /> : null}
          <View style={[styles.line, styles.net]}>
            <Text variant="body" weight="black">Net payout</Text>
            <Text variant="heading3" weight="black" color={colors.primary}>{fmt(job.net)}</Text>
          </View>
          {job.orderId ? <Text variant="caption" color={ink[400]}>Order ID: {job.orderId}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function WorkerEarningsPage() {
  const [period, setPeriod] = useState('month');
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = useGetJobEarningsQuery({ period });
  const jobs: Job[] = data?.jobs ?? [];
  const summary = data?.summary ?? {};

  return (
    <View style={styles.page}>
      <ScreenHeader
        title="Earnings"
        safeArea
        right={jobs.length ? (
          <Pressable onPress={() => Share.share({ title: `Payslip (${period})`, message: payslipCsv(jobs) })} accessibilityRole="button" accessibilityLabel="Share payslip" hitSlop={8} style={styles.share}>
            <Share2 size={18} color={ink[700]} />
          </Pressable>
        ) : undefined}
      />
      <FlatList
        data={isLoading ? [] : jobs}
        keyExtractor={(j) => j._id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.total}>
              <Text variant="caption" weight="bold" color="rgba(255,255,255,0.7)">TOTAL NET EARNINGS</Text>
              <Text variant="display" weight="black" color="#fff">{fmt(summary.totalNet ?? 0)}</Text>
            </View>
            <View style={styles.periods} accessibilityRole="tablist">
              {PERIODS.map((p) => (
                <Pressable key={p.id} onPress={() => setPeriod(p.id)} accessibilityRole="tab" accessibilityState={{ selected: period === p.id }}
                  style={[styles.period, period === p.id && styles.periodOn]}>
                  <Text variant="bodySmall" weight="bold" color={period === p.id ? '#fff' : ink[500]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.stats}>
              <View style={styles.stat}><Text variant="caption" weight="bold" color={ink[400]}>JOBS DONE</Text><Text variant="heading2" weight="black">{summary.count ?? 0}</Text></View>
              <View style={styles.stat}><Text variant="caption" weight="bold" color={ink[400]}>TIPS</Text><Text variant="heading2" weight="black" color={success[600]}>{fmt(summary.totalTips ?? 0)}</Text></View>
              <View style={[styles.stat, styles.statSurge]}><Text variant="caption" weight="bold" color={accent[600]}>SURGE JOBS</Text><Text variant="heading2" weight="black" color={accent[600]}>{summary.surgeCount ?? 0}</Text></View>
            </View>
            <View style={styles.info}>
              <Info size={16} color={zappy[500]} />
              <Text variant="bodySmall" color={zappy[800]} style={styles.flex}>The platform fee is ZappyOne's commission, taken from each job. Tips and customer boosts are all yours.</Text>
            </View>
            <Text variant="caption" weight="black" color={ink[400]} style={styles.label}>JOB BREAKDOWN</Text>
            {isLoading ? <SkeletonList count={4} /> : null}
          </View>
        }
        ListEmptyComponent={isLoading ? null : (
          <EmptyState title="No earnings found" message="Complete jobs in this period to see them here." icon={<BarChart2 size={24} color={ink[300]} />} />
        )}
        renderItem={({ item }) => <EarningRow job={item} open={open === item._id} onToggle={() => setOpen((p) => (p === item._id ? null : item._id))} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  right: { alignItems: 'flex-end' },
  share: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.base, paddingBottom: spacing.xxxl },
  headerBlock: { gap: spacing.base, marginBottom: spacing.md },
  total: { backgroundColor: ink[900], borderRadius: radius.medium, paddingVertical: spacing.xl, alignItems: 'center', gap: 4 },
  periods: { flexDirection: 'row', gap: 4, backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: 4 },
  period: { flex: 1, alignItems: 'center', borderRadius: radius.button, minHeight: 40, justifyContent: 'center' },
  periodOn: { backgroundColor: colors.primary },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: 'center', gap: 2 },
  statSurge: { backgroundColor: accent[50], borderColor: accent[100] },
  info: { flexDirection: 'row', gap: spacing.md, backgroundColor: zappy[50], borderRadius: radius.medium, borderWidth: 1, borderColor: zappy[100], padding: spacing.md },
  label: { letterSpacing: 1, marginTop: spacing.sm },
  sep: { height: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 64 },
  icon: { width: 44, height: 44, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  surgeTag: { backgroundColor: accent[100], borderRadius: radius.pill, paddingHorizontal: 8, marginTop: 2 },
  breakdown: { borderTopWidth: 1, borderTopColor: slate[100], backgroundColor: slate[50], padding: spacing.base, gap: spacing.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  net: { borderTopWidth: 1, borderTopColor: slate[200], paddingTop: spacing.sm, marginTop: 4 },
});
