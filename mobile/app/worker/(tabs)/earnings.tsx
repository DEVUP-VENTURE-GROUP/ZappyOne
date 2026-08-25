/**
 * Worker earnings.
 * ----------------------------------------------------------------------------
 * Financial hierarchy, top to bottom: what you've earned in the selected
 * period, what made it up, then the line-by-line ledger, then where the money
 * goes.
 *
 * ── UNITS ──────────────────────────────────────────────────────────────────
 * The two endpoints disagree, and getting this wrong is a 100× error on
 * someone's income:
 *   `/workers/earnings`      → `earningsRupees` (RUPEES), `earningsPaise`
 *   `/workers/job-earnings`  → gross / net / tip / bonus, all PAISE
 * Everything is converted to rupees exactly once, at the render site, through
 * `formatRupees`. Nothing is added across the two sources.
 *
 * ── THE LEDGER WAS NEVER WIRED UP ──────────────────────────────────────────
 * `/workers/job-earnings` is the real per-job breakdown — gross, platform fee,
 * commission percent, tip, bonus and net per completed job — and no client
 * code referenced it. The old screen showed only the rolled-up summary, so a
 * pro could see a total but never what produced it.
 *
 * ── PAYOUTS ────────────────────────────────────────────────────────────────
 * There is NO worker-facing payout endpoint: every payout route on the server
 * lives under `modules/admin` and requires an admin. So there is no payout
 * schedule, no "next payout on Monday", no pending-payout figure — those would
 * all be invented. What a worker CAN see is the destination the money goes to
 * (`/workers/bank-accounts`, already masked server-side), and that is all this
 * section claims.
 *
 * No charts either: `dailyBreakdown` exists, but a trend line over a handful
 * of days invites reading a pattern that isn't there.
 * ----------------------------------------------------------------------------
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Banknote,
  CreditCard,
  Landmark,
  ReceiptText,
  TrendingUp,
  Wallet as WalletIcon,
  Info,
} from 'lucide-react-native';
import {
  Appear,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Gradient,
  Heading,
  SectionTitle,
  Skeleton,
  Text,
  formatRupees,
} from '../../../components/ui';
import {
  useGetEarningsQuery,
  useGetJobEarningsQuery,
  useGetPayoutDestinationsQuery,
  useGetWorkerMeQuery,
} from '../../../services/api/workerApi';
import { getApiErrorMessage } from '../../../services/api/apiSlice';
import { accent, colors, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { bottomNavClearance, screenPadding, spacing } from '../../../theme/spacing';
import type { WorkerJobEarning } from '../../../types/api';

/** The three windows `/workers/earnings` accepts, and their ledger equivalents. */
/** `linear-gradient(135deg,#0f172a,#1e1b4b,#1e3a5f)` on the web. */
const EARNINGS_GRADIENT = ['#0F172A', '#1E3A5F'] as const;

const RANGES = [
  { key: 'today', label: 'Today', period: undefined },
  { key: 'week', label: 'This week', period: 'week' },
  { key: 'month', label: 'This month', period: 'month' },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

function formatDay(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** One completed job. All figures paise → rupees here and nowhere else. */
function JobRow({ job }: { job: WorkerJobEarning }) {
  return (
    <View style={styles.jobRow}>
      <View style={styles.jobIcon}>
        <ReceiptText size={16} color={colors.textSecondary} />
      </View>

      <View style={styles.flex}>
        <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
          {job.serviceLabel || job.service}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {formatDay(job.completedAt)} · #{job.orderId}
        </Text>

        {/* Only shown when the server says there was one. */}
        <View style={styles.jobExtras}>
          {job.tip > 0 ? (
            <Text variant="caption" color={colors.successDark}>
              +{formatRupees(job.tip / 100)} tip
            </Text>
          ) : null}
          {job.bonus > 0 ? (
            <Text variant="caption" color={colors.accentDark}>
              +{formatRupees(job.bonus / 100)} bonus
            </Text>
          ) : null}
          {job.surgeMultiplier > 1 ? (
            <Text variant="caption" color={colors.accentDark}>
              {job.surgeMultiplier}× surge
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.jobAmount}>
        <Text variant="bodySmall" weight="semibold">
          {formatRupees(job.net / 100)}
        </Text>
        {/* The gross and the cut, so "net" isn't a number without provenance. */}
        <Text variant="caption" color={colors.textMuted}>
          of {formatRupees(job.gross / 100)}
        </Text>
      </View>
    </View>
  );
}

export default function WorkerEarningsScreen() {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<RangeKey>('today');

  const activeRange = RANGES.find((r) => r.key === range) ?? RANGES[0];

  const {
    data: earnings,
    isLoading: earningsLoading,
    error: earningsError,
    refetch: refetchEarnings,
    isFetching,
  } = useGetEarningsQuery(range);

  const {
    data: ledger,
    isLoading: ledgerLoading,
    refetch: refetchLedger,
  } = useGetJobEarningsQuery({ page: 1, period: activeRange.period });

  const { data: worker } = useGetWorkerMeQuery();
  const { data: payout } = useGetPayoutDestinationsQuery();

  /**
   * `/workers/job-earnings` accepts week | month | 3months — there is no
   * "today". Sending no period returns ALL time, which put an all-time list
   * directly under a "Today ₹0" headline: the two halves of the screen
   * disagreeing about the same question. For Today the rows are filtered
   * client-side to jobs completed since local midnight, so the list can only
   * ever be a subset of what the headline counts.
   */
  const jobs = useMemo(() => {
    const all = ledger?.jobs ?? [];
    if (range !== 'today') return all;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return all.filter(
      (j) => j.completedAt && new Date(j.completedAt).getTime() >= midnight.getTime(),
    );
  }, [ledger, range]);

  // The server's summary covers the period it was asked for. On Today the rows
  // were narrowed here, so its count and tip total describe a different window
  // and are not shown.
  const summary = range === 'today' ? null : (ledger?.summary ?? null);
  const hasDestination =
    (payout?.banks.length ?? 0) > 0 || (payout?.upiIds.length ?? 0) > 0;

  const reload = () => {
    refetchEarnings();
    refetchLedger();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Heading level={1}>Earnings</Heading>
        <Text variant="muted">Everything you&apos;ve made with Zappy</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomNavClearance + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Range ─────────────────────────────────────────────────────── */}
        <View style={styles.rangeRow}>
          {RANGES.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              selected={range === option.key}
              tone={range === option.key ? 'blue' : 'neutral'}
              onPress={() => setRange(option.key)}
            />
          ))}
        </View>

        {/* ── Headline ──────────────────────────────────────────────────── */}
        {earningsLoading ? (
          <Skeleton width="100%" height={170} borderRadius={radius.large} />
        ) : earningsError ? (
          <ErrorState
            message={getApiErrorMessage(earningsError, "We couldn't load your earnings.")}
            onRetry={reload}
          />
        ) : (
          <Appear>
            {/*
              The website's earnings header is a dark navy→indigo sweep —
              `linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#1e3a5f 100%)` —
              with the total sitting on it in Black, not an amber card. The
              two-stop primitive takes its endpoints; the indigo midpoint reads
              through the blend.
            */}
            <Gradient colors={EARNINGS_GRADIENT} style={styles.headline}>
              <Text variant="label" color="rgba(255,255,255,0.8)">
                {activeRange.label.toUpperCase()}
              </Text>
              {/* `earningsRupees` is already rupees — do NOT divide. */}
              <Text variant="display" color={colors.textInverse} style={styles.headlineValue}>
                {formatRupees(earnings?.earningsRupees ?? 0)}
              </Text>

              <View style={styles.headlineStats}>
                <HeadlineStat label="Jobs" value={String(earnings?.jobs ?? 0)} />
                <HeadlineStat
                  label="Avg / job"
                  value={formatRupees(earnings?.avgEarningPerJobRupees ?? 0)}
                />
                <HeadlineStat
                  label="Zappy fee"
                  value={formatRupees((earnings?.commissionPaidPaise ?? 0) / 100)}
                />
              </View>
            </Gradient>
          </Appear>
        )}

        {/* ── Completed jobs + lifetime ──────────────────────────────────── */}
        <Appear delay={40}>
          <View style={styles.tileRow}>
            <Card variant="outline" style={styles.tile}>
              <View style={[styles.tileIcon, { backgroundColor: colors.successTint }]}>
                <TrendingUp size={16} color={colors.successDark} />
              </View>
              <Text variant="heading2">{worker?.completedJobs ?? 0}</Text>
              <Text variant="caption" color={colors.textMuted}>
                Jobs completed
              </Text>
            </Card>

            <Card variant="outline" style={styles.tile}>
              <View style={[styles.tileIcon, { backgroundColor: colors.accentTint }]}>
                <WalletIcon size={16} color={accent[600]} />
              </View>
              <Text variant="heading2">
                {formatRupees(worker?.wallet?.totalEarnings ?? 0)}
              </Text>
              <Text variant="caption" color={colors.textMuted}>
                Lifetime earned
              </Text>
            </Card>
          </View>
        </Appear>

        {/* ── How this period splits ────────────────────────────────────── */}
        {earnings && earnings.jobs > 0 ? (
          <Appear delay={80}>
            <Card variant="outline" style={styles.splitCard}>
              <SectionTitle>How you were paid</SectionTitle>
              <View style={styles.splitRow}>
                <Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
                  Collected in cash
                </Text>
                <Text variant="bodySmall" weight="semibold">
                  {earnings.cashJobs} {earnings.cashJobs === 1 ? 'job' : 'jobs'}
                </Text>
              </View>
              <Divider style={styles.splitDivider} />
              <View style={styles.splitRow}>
                <Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
                  Paid online
                </Text>
                <Text variant="bodySmall" weight="semibold">
                  {earnings.onlineJobs} {earnings.onlineJobs === 1 ? 'job' : 'jobs'}
                </Text>
              </View>
            </Card>
          </Appear>
        ) : null}

        {/* ── Ledger ────────────────────────────────────────────────────── */}
        <Appear delay={120}>
          <View style={styles.block}>
            <View style={styles.blockHead}>
              {/*
                The website calls this "Job Breakdown" and precedes it with a
                note that the platform fee is deducted per job — the one thing
                a worker most needs to understand about these figures.
              */}
              <View style={styles.feeNote}>
                <Info size={15} color={zappy[600]} />
                <Text variant="caption" color={zappy[800]} style={styles.flex}>
                  A platform fee is deducted from each job. Your plan decides
                  how much.
                </Text>
              </View>
              <SectionTitle style={styles.blockTitle}>Job breakdown</SectionTitle>
              {summary?.count ? (
                <Text variant="caption" color={colors.textMuted}>
                  {summary.count} total
                </Text>
              ) : null}
            </View>

            {ledgerLoading ? (
              <Card variant="outline" padding={spacing.base}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.jobRow}>
                    <Skeleton width={34} height={34} borderRadius={radius.small} />
                    <View style={styles.flex}>
                      <Skeleton width="60%" height={13} />
                      <Skeleton width="35%" height={10} style={{ marginTop: spacing.xs }} />
                    </View>
                    <Skeleton width={54} height={13} />
                  </View>
                ))}
              </Card>
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={<Banknote size={26} color={colors.textMuted} />}
                title="No earnings yet"
                message={
                  range === 'today'
                    ? "Jobs you complete today will appear here with what you earned on each."
                    : 'Complete a job and its full breakdown shows up here.'
                }
              />
            ) : (
              <Card variant="outline" padding={spacing.base}>
                {jobs.map((job, index) => (
                  <View key={job._id}>
                    {index > 0 ? <Divider style={styles.jobDivider} /> : null}
                    <JobRow job={job} />
                  </View>
                ))}

                {/* Tips are called out separately: they are the worker's own,
                    not part of the fare Zappy takes a cut of. */}
                {summary && summary.totalTips > 0 ? (
                  <>
                    <Divider style={styles.jobDivider} />
                    <View style={styles.splitRow}>
                      <Text variant="bodySmall" color={colors.successDark} style={styles.flex}>
                        Tips in this period
                      </Text>
                      <Text variant="bodySmall" weight="semibold" color={colors.successDark}>
                        {formatRupees(summary.totalTips / 100)}
                      </Text>
                    </View>
                  </>
                ) : null}
              </Card>
            )}

            {range !== 'today' && ledger && ledger.totalPages > 1 ? (
              <Text variant="caption" color={colors.textMuted} align="center">
                Showing the {jobs.length} most recent of {ledger.total}
              </Text>
            ) : null}
          </View>
        </Appear>

        {/* ── Payout destination ────────────────────────────────────────── */}
        <Appear delay={160}>
          <View style={styles.block}>
            <SectionTitle>Where you get paid</SectionTitle>

            {hasDestination ? (
              <Card variant="outline" padding={spacing.base}>
                {payout?.banks.map((bank, index) => (
                  <View key={bank._id ?? bank.accountNumber}>
                    {index > 0 ? <Divider style={styles.jobDivider} /> : null}
                    <View style={styles.jobRow}>
                      <View style={styles.jobIcon}>
                        <Landmark size={16} color={colors.primary} />
                      </View>
                      <View style={styles.flex}>
                        <Text variant="bodySmall" weight="semibold">
                          {bank.bankName || bank.label || 'Bank account'}
                        </Text>
                        {/* Server sends this already masked. */}
                        <Text variant="caption" color={colors.textMuted}>
                          {bank.accountNumber}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}

                {payout?.upiIds.map((upi, index) => (
                  <View key={upi._id ?? upi.upiId}>
                    {(payout?.banks.length ?? 0) > 0 || index > 0 ? (
                      <Divider style={styles.jobDivider} />
                    ) : null}
                    <View style={styles.jobRow}>
                      <View style={styles.jobIcon}>
                        <CreditCard size={16} color={colors.primary} />
                      </View>
                      <View style={styles.flex}>
                        <Text variant="bodySmall" weight="semibold">
                          {upi.upiLabel || 'UPI'}
                        </Text>
                        <Text variant="caption" color={colors.textMuted}>
                          {upi.upiId}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </Card>
            ) : (
              <Card variant="outline">
                <Text variant="bodySmall" color={colors.textSecondary}>
                  No payout account added yet. Add a bank account or UPI ID from
                  your profile so Zappy knows where to send your earnings.
                </Text>
              </Card>
            )}
          </View>
        </Appear>

        {isFetching && !earningsLoading ? (
          <Text variant="caption" color={colors.textMuted} align="center">
            Refreshing…
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function HeadlineStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.headlineStat}>
      <Text variant="body" weight="semibold" color={colors.textInverse}>
        {value}
      </Text>
      <Text variant="caption" color="rgba(255,255,255,0.7)">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  header: { paddingHorizontal: screenPadding, gap: spacing.xxs, marginBottom: spacing.base },
  scroll: { paddingHorizontal: screenPadding, gap: spacing.lg },

  rangeRow: { flexDirection: 'row', gap: spacing.sm },

  headline: { padding: spacing.lg, borderRadius: radius.large, gap: spacing.xxs },
  headlineValue: { letterSpacing: -1 },
  headlineStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  headlineStat: { gap: 1 },

  tileRow: { flexDirection: 'row', gap: spacing.md },
  tile: { flex: 1, gap: spacing.xxs },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },

  splitCard: { gap: spacing.xs },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  splitDivider: { marginVertical: spacing.sm },

  block: { gap: spacing.sm },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // `bg-indigo-50/50 border border-indigo-100/50 rounded-2xl p-4` on the web.
  feeNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: zappy[50],
    borderWidth: 1,
    borderColor: zappy[100],
    borderRadius: radius.medium,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  blockTitle: { marginBottom: 0 },

  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  jobIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobExtras: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 1 },
  jobAmount: { alignItems: 'flex-end' },
  jobDivider: { marginVertical: 0 },
});
