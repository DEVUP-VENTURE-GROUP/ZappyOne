/**
 * Worker dashboard pieces.
 * ----------------------------------------------------------------------------
 * Same design system as the customer app — same Card, Button, tokens and type
 * scale — so this reads as Zappy for Professionals rather than a second app
 * that happens to share a logo. The one deliberate divergence is emphasis:
 * amber leads the earning surfaces because that is what a pro opens the app
 * for, while Zappy blue stays the action colour throughout.
 *
 * ── NO INVENTED METRICS ────────────────────────────────────────────────────
 * Every figure rendered here is passed in from `/workers/me` or
 * `/workers/earnings`. There is no acceptance-rate percentage, no "you're in
 * the top 10%", no projected daily target — the API computes none of those,
 * and a pro's income is not a place to display a number we made up.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Clock, IndianRupee, Power, TrendingUp } from 'lucide-react-native';
import { Button, Card, Gradient, SectionTitle, Text, formatRupees } from '../ui';
import { accent, colors, navy, success } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// ── Online status ───────────────────────────────────────────────────────────

export interface OnlineHeroProps {
  online: boolean;
  /** ISO string from `worker.onlineSince`. Null when offline. */
  onlineSince?: string | null;
  /** False until KYC is approved — the server refuses `/workers/online`. */
  canGoOnline: boolean;
  busy?: boolean;
  onToggle: (next: boolean) => void;
}

/** Live dot. Only while online, and never under reduced motion. */
function LiveDot() {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
  }, [pulse, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: 0.4 + pulse.value * 0.6 }));
  return <Animated.View style={[styles.liveDot, style]} />;
}

/** "2h 14m" since the session began. A fact, not a target. */
function useSessionLength(since?: string | null): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [since]);

  if (!since) return null;
  const started = new Date(since).getTime();
  if (Number.isNaN(started)) return null;
  const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`;
}

export const OnlineHero = memo(function OnlineHero({
  online,
  onlineSince,
  canGoOnline,
  busy,
  onToggle,
}: OnlineHeroProps) {
  const session = useSessionLength(online ? onlineSince : null);

  return (
    <Gradient
      colors={online ? [success[600], navy[900]] : [navy[700], navy[900]]}
      style={styles.hero}
    >
      <View style={styles.heroTop}>
        <View style={styles.statusRow}>
          {online ? <LiveDot /> : <View style={styles.offlineDot} />}
          <Text variant="label" color="rgba(255,255,255,0.85)">
            {online ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </View>

        {/* Session length is elapsed time, nothing more. No shift targets. */}
        {online && session ? (
          <View style={styles.sessionRow}>
            <Clock size={12} color="rgba(255,255,255,0.75)" />
            <Text variant="caption" color="rgba(255,255,255,0.75)">
              {session}
            </Text>
          </View>
        ) : null}
      </View>

      <Text variant="heading2" color={colors.textInverse} style={styles.heroTitle}>
        {online ? "You're taking jobs" : 'Go online to get jobs'}
      </Text>
      <Text variant="bodySmall" color="rgba(255,255,255,0.8)">
        {online
          ? 'New requests near you will appear here.'
          : canGoOnline
            ? 'Zappy only sends you work while you’re online.'
            : 'Finish your KYC verification to start taking jobs.'}
      </Text>

      {/* One control, not a switch plus a button saying the same thing. */}
      <Button
        label={online ? 'Go offline' : 'Go online'}
        variant={online ? 'secondary' : 'success'}
        icon={
          <Power size={16} color={online ? colors.textHeading : colors.textInverse} />
        }
        onPress={() => onToggle(!online)}
        loading={busy}
        disabled={!canGoOnline && !online}
        style={styles.heroButton}
      />
    </Gradient>
  );
});

// ── Earnings ────────────────────────────────────────────────────────────────

export interface EarningsSummaryProps {
  /** From `/workers/earnings?range=today`. Undefined while loading. */
  earningsRupees?: number;
  jobs?: number;
  avgPerJobRupees?: number;
  cashJobs?: number;
  onlineJobs?: number;
  /** `worker.wallet.totalEarnings` — lifetime, in rupees. */
  lifetimeRupees?: number;
  onPress?: () => void;
}

export const EarningsSummary = memo(function EarningsSummary({
  earningsRupees,
  jobs,
  avgPerJobRupees,
  cashJobs,
  onlineJobs,
  lifetimeRupees,
  onPress,
}: EarningsSummaryProps) {
  const loaded = typeof earningsRupees === 'number';

  return (
    <View style={styles.block}>
      <SectionTitle>Today</SectionTitle>
      <Card variant="outline" onPress={onPress} style={styles.earningsCard}>
        <View style={styles.earningsTop}>
          <View style={styles.earningsIcon}>
            <IndianRupee size={18} color={accent[600]} />
          </View>
          <View style={styles.flex}>
            <Text variant="label">EARNED TODAY</Text>
            {/* Nothing until the figure arrives — a placeholder zero on an
                earnings screen is worse than a blank. */}
            <Text variant="heading1">
              {loaded ? formatRupees(earningsRupees as number) : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <Stat label="Jobs" value={typeof jobs === 'number' ? String(jobs) : '—'} />
          <Stat
            label="Avg / job"
            value={
              typeof avgPerJobRupees === 'number' ? formatRupees(avgPerJobRupees) : '—'
            }
          />
          {/* The server splits jobs by how they were paid; both are real. */}
          <Stat
            label="Cash"
            value={typeof cashJobs === 'number' ? String(cashJobs) : '—'}
          />
          <Stat
            label="Online"
            value={typeof onlineJobs === 'number' ? String(onlineJobs) : '—'}
          />
        </View>

        {typeof lifetimeRupees === 'number' ? (
          <View style={styles.lifetimeRow}>
            <TrendingUp size={13} color={colors.textMuted} />
            <Text variant="caption" color={colors.textSecondary}>
              {formatRupees(lifetimeRupees)} earned with Zappy so far
            </Text>
          </View>
        ) : null}
      </Card>
    </View>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="body" weight="semibold">
        {value}
      </Text>
      <Text variant="caption" color={colors.textMuted}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: spacing.sm },

  hero: { padding: spacing.lg, borderRadius: radius.large, gap: spacing.xxs },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: success[500] },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  heroTitle: { marginBottom: spacing.xxs },
  heroButton: { alignSelf: 'flex-start', marginTop: spacing.lg },

  earningsCard: { gap: spacing.base },
  earningsTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  earningsIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.medium,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  stat: { gap: 1 },
  lifetimeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
