/**
 * Rewards.
 * ----------------------------------------------------------------------------
 * Points, redemption, scratch cards and the gamification level — all read from
 * `GET /rewards` and `GET /gamification`.
 *
 * ── WHAT THE SERVER ACTUALLY SENDS ─────────────────────────────────────────
 * The previous screen showed a "tier" badge from `rewards.tier`, a field the
 * API has never returned — so it silently never rendered. The real payload
 * carries `points`, `redeemableRupees`, `minRedeemPoints`, `redeemPaisePerPoint`,
 * `lifetimeEarned` and `lifetimeRedeemed`, plus `enabled` when the programme is
 * switched off server-side. Tier-like standing lives on `/gamification`
 * (`level`, `label`, `progress`), which is a different endpoint and is labelled
 * as such.
 *
 * The redemption maths is NOT done here. `redeemableRupees` is what the server
 * says the balance is worth, and `minRedeemPoints` is its floor; the screen
 * reads both rather than deriving a value from a rate it happens to know.
 * ----------------------------------------------------------------------------
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gift, Lock, Sparkles, Trophy } from 'lucide-react-native';
import {
  Appear,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Gradient,
  ScalePressable,
  ScreenHeader,
  SectionTitle,
  Skeleton,
  Text,
  formatRupees,
} from '../components/ui';
import {
  useGetGamificationQuery,
  useGetRewardsQuery,
  useRedeemRewardPointsMutation,
  useScratchRewardCardMutation,
} from '../services/api/rewardsApi';
import { getApiErrorMessage } from '../services/api/apiSlice';
import { accent, colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { screenPadding, spacing } from '../theme/spacing';

export default function RewardsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: rewards, isLoading, error, refetch } = useGetRewardsQuery();
  const { data: game } = useGetGamificationQuery();
  const [redeem, { isLoading: redeeming }] = useRedeemRewardPointsMutation();
  const [scratch, { isLoading: scratching }] = useScratchRewardCardMutation();

  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const points = rewards?.points ?? 0;
  const minRedeem = rewards?.minRedeemPoints;
  const canRedeem =
    points > 0 && (typeof minRedeem !== 'number' || points >= minRedeem);

  const doRedeem = async () => {
    setActionError(null);
    setMessage(null);
    try {
      const res = await redeem({ points }).unwrap();
      setMessage(
        `${formatRupees(res.walletCreditPaise / 100)} added to your Zappy Wallet.`,
      );
      refetch();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "We couldn't redeem those points."));
    }
  };

  const doScratch = async (cardId: string) => {
    setActionError(null);
    setMessage(null);
    try {
      const res = await scratch(cardId).unwrap();
      // The server names the prize; this only formats it.
      setMessage(
        res.rewardType === 'cashback'
          ? `You won ${formatRupees(res.rewardValue)} cashback!`
          : res.rewardType === 'points'
            ? `You won ${res.rewardValue} points!`
            : `You won ${res.rewardValue} off your next booking!`,
      );
      refetch();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "That card couldn't be scratched."));
    }
  };

  // ── Programme switched off server-side ──────────────────────────────────
  if (rewards?.enabled === false) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Rewards" onBack={() => router.back()} />
        </View>
        <EmptyState
          icon={<Gift size={28} color={colors.textMuted} />}
          title="Rewards aren't running right now"
          message="Zappy Rewards is currently switched off. We'll let you know when it's back."
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Rewards" onBack={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={undefined}
      >
        {isLoading ? (
          <>
            <Skeleton width="100%" height={170} borderRadius={radius.large} />
            <Skeleton width="100%" height={90} borderRadius={radius.large} />
          </>
        ) : error ? (
          <ErrorState
            message={getApiErrorMessage(error, "We couldn't load your rewards.")}
            onRetry={refetch}
          />
        ) : (
          <>
            {/* ── Points ───────────────────────────────────────────────── */}
            <Appear>
              {/* Amber ramp rather than amber→navy: the midpoint of that pair is a
                  muddy brown, which is not what #F59E0B is for. */}
              <Gradient colors={[accent[500], accent[700]]} style={styles.pointsCard}>
                <View style={styles.pointsLabel}>
                  <Sparkles size={14} color={colors.textInverse} />
                  <Text variant="label" color="rgba(255,255,255,0.8)">
                    YOUR POINTS
                  </Text>
                </View>
                <Text variant="display" color={colors.textInverse} style={styles.points}>
                  {points.toLocaleString('en-IN')}
                </Text>

                {/* The server's own valuation, not a client calculation. */}
                {typeof rewards?.redeemableRupees === 'number' ? (
                  <Text variant="bodySmall" color="rgba(255,255,255,0.85)">
                    Worth {formatRupees(rewards.redeemableRupees)} in your wallet
                  </Text>
                ) : null}

                <Button
                  label="Redeem to wallet"
                  variant="secondary"
                  size="small"
                  onPress={doRedeem}
                  loading={redeeming}
                  disabled={!canRedeem}
                  style={styles.redeemButton}
                />

                {!canRedeem && typeof minRedeem === 'number' && points < minRedeem ? (
                  <Text variant="caption" color="rgba(255,255,255,0.75)">
                    {minRedeem - points} more points until you can redeem.
                  </Text>
                ) : null}
              </Gradient>
            </Appear>

            {message ? (
              <Card variant="outline" style={styles.successCard}>
                <Text variant="bodySmall" color={colors.successDark}>
                  {message}
                </Text>
              </Card>
            ) : null}
            {actionError ? (
              <Card variant="outline" style={styles.errorCard}>
                <Text variant="bodySmall" color={colors.errorDark}>
                  {actionError}
                </Text>
              </Card>
            ) : null}

            {/* ── Level — a different endpoint, labelled as such ────────── */}
            {game ? (
              <Appear offsetY={6}>
                <Card variant="outline" style={styles.levelCard}>
                  <View style={styles.levelRow}>
                    <View style={styles.levelIcon}>
                      <Trophy size={18} color={accent[600]} />
                    </View>
                    <View style={styles.flex}>
                      <Text variant="body" weight="semibold">
                        Level {game.level} · {game.label}
                      </Text>
                      {game.nextLevelLabel ? (
                        <Text variant="caption" color={colors.textSecondary}>
                          {game.xp} / {game.nextLevelXp} XP to {game.nextLevelLabel}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        // `progress` is server-computed; clamped only for safety.
                        { width: `${Math.max(0, Math.min(1, game.progress)) * 100}%` },
                      ]}
                    />
                  </View>

                  <View style={styles.statRow}>
                    <Stat label="Bookings" value={String(game.totalOrders)} />
                    <Stat label="Streak" value={`${game.streak} wk`} />
                    <Stat label="Badges" value={String(game.badges?.length ?? 0)} />
                  </View>
                </Card>
              </Appear>
            ) : null}

            {/* ── Scratch cards ────────────────────────────────────────── */}
            {rewards?.scratchCards && rewards.scratchCards.length > 0 ? (
              <Appear offsetY={6}>
                <SectionTitle>Scratch cards</SectionTitle>
                <View style={styles.cardGrid}>
                  {rewards.scratchCards.map((card) => (
                    // `status` is the server's field — 'locked' | 'unlocked' |
                    // 'scratched'. A locked card is not yet earned, so it is
                    // shown but not tappable.
                    <ScalePressable
                      key={card._id}
                      onPress={() => doScratch(card._id)}
                      disabled={scratching || card.status !== 'unlocked'}
                      style={[
                        styles.scratchCard,
                        card.status !== 'unlocked' ? styles.scratchCardIdle : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={
                        card.status === 'scratched'
                          ? 'Already scratched'
                          : card.status === 'locked'
                            ? 'Locked card'
                            : 'Scratch to reveal'
                      }
                    >
                      {card.status === 'locked' ? (
                        <Lock size={20} color={colors.textMuted} />
                      ) : (
                        <Gift
                          size={22}
                          color={card.status === 'scratched' ? colors.textMuted : accent[600]}
                        />
                      )}
                      <Text variant="caption" color={colors.textSecondary} align="center">
                        {card.status === 'scratched'
                          ? card.rewardValue != null
                            ? `Won ${card.rewardValue}`
                            : 'Revealed'
                          : card.status === 'locked'
                            ? 'Locked'
                            : 'Tap to scratch'}
                      </Text>
                    </ScalePressable>
                  ))}
                </View>
              </Appear>
            ) : null}

            {/* ── Lifetime ─────────────────────────────────────────────── */}
            {typeof rewards?.lifetimeEarned === 'number' ? (
              <Appear offsetY={6}>
                <Card variant="outline">
                  <SectionTitle>Lifetime</SectionTitle>
                  <View style={styles.statRow}>
                    <Stat label="Earned" value={rewards.lifetimeEarned.toLocaleString('en-IN')} />
                    <Stat
                      label="Redeemed"
                      value={(rewards.lifetimeRedeemed ?? 0).toLocaleString('en-IN')}
                    />
                  </View>
                </Card>
              </Appear>
            ) : null}

            {points === 0 && (!rewards?.scratchCards || rewards.scratchCards.length === 0) ? (
              <EmptyState
                icon={<Sparkles size={26} color={colors.textMuted} />}
                title="Start earning"
                message="You'll collect points on every completed booking, and they turn into wallet credit."
                actionLabel="Browse services"
                onAction={() => router.push('/(tabs)/services')}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="heading3">{value}</Text>
      <Text variant="caption" color={colors.textMuted}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: screenPadding, gap: spacing.lg },

  pointsCard: { padding: spacing.lg, borderRadius: radius.large, gap: spacing.xxs },
  pointsLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  points: { letterSpacing: -1 },
  redeemButton: { alignSelf: 'flex-start', marginTop: spacing.base, marginBottom: spacing.xs },

  successCard: { backgroundColor: colors.successTint, borderColor: colors.successTint },
  errorCard: { backgroundColor: colors.errorTint, borderColor: colors.errorTint },

  levelCard: { gap: spacing.base },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.small,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceTertiary,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },

  statRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.xs },
  stat: { gap: 1 },

  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  scratchCard: {
    width: 104,
    height: 104,
    borderRadius: radius.medium,
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: accent[100],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  scratchCardIdle: {
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderStyle: 'solid',
  },
});
