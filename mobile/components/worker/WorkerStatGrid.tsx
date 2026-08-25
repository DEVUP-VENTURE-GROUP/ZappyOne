/**
 * The worker dashboard's stat grid.
 * ----------------------------------------------------------------------------
 * `client/src/pages/WorkerDashboard.jsx` builds a six-card grid — Wallet
 * Balance, Today's Earnings, Today's Jobs, Your Rating, Today's Hours and
 * Acceptance Rate — each a tinted icon over a label and a value.
 *
 * ── WHY THIS GRID HAS FEWER CARDS ──────────────────────────────────────────
 * Only the cards the mobile backend can actually fill are rendered. Checked
 * against a live `GET /workers/me`:
 *
 *   Today's Earnings   ✓ /workers/earnings → earningsRupees
 *   Today's Jobs       ✓ /workers/earnings → jobs
 *   Your Rating        ✓ /workers/me       → rating
 *   Acceptance Rate    ✓ /workers/me       → penalties.totalOffers/totalRejects
 *   Today's Hours      ~ /workers/me       → onlineSince, which is null unless
 *                                            a session is actually open
 *   Wallet Balance     ✗ the response carries NO wallet object
 *
 * A wallet card would therefore have printed ₹0 for every worker regardless of
 * their balance, which is worse than not showing it — so it is left out rather
 * than filled with a zero the server never sent. Any card whose value is
 * genuinely unknown renders an em dash, never a zero.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BadgeIndianRupee,
  Briefcase,
  CircleCheck,
  Clock,
  Star,
  type LucideIcon,
} from 'lucide-react-native';
import { Card, ScalePressable, Text, formatRupees } from '../ui';
import { accent, colors, success, zappy, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { fontFamily } from '../../theme/typography';
import type { WorkerProfile } from '../../types/api';

export interface WorkerStatGridProps {
  worker?: WorkerProfile | null;
  /** From `GET /workers/earnings` for the current range. */
  earningsRupees?: number;
  jobsToday?: number;
  onOpenEarnings?: () => void;
  onOpenJobs?: () => void;
}

interface StatDef {
  key: string;
  Icon: LucideIcon;
  tint: string;
  fg: string;
  label: string;
  /** Null renders an em dash — the value is genuinely unknown. */
  value: string | null;
  onPress?: () => void;
}

/** "02h 15m" from an ISO start time, or null when no session is open. */
function hoursSince(iso?: string | null): string | null {
  if (!iso) return null;
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return null;
  const secs = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  return `${h}h ${m}m`;
}

function WorkerStatGridBase({
  worker,
  earningsRupees,
  jobsToday,
  onOpenEarnings,
  onOpenJobs,
}: WorkerStatGridProps) {
  const stats = useMemo<StatDef[]>(() => {
    const offers = Number(worker?.penalties?.totalOffers ?? 0);
    const rejects = Number(worker?.penalties?.totalRejects ?? 0);
    // Only meaningful once the worker has actually been offered something.
    const acceptRate =
      offers > 0 ? Math.round(((offers - rejects) / offers) * 100) : null;

    const hours = hoursSince(worker?.onlineSince);

    return [
      {
        key: 'earnings',
        Icon: BadgeIndianRupee,
        tint: success[50],
        fg: success[600],
        label: "Today's earnings",
        value: typeof earningsRupees === 'number' ? formatRupees(earningsRupees) : null,
        onPress: onOpenEarnings,
      },
      {
        key: 'jobs',
        Icon: Briefcase,
        tint: accent[50],
        fg: accent[600],
        label: "Today's jobs",
        value: typeof jobsToday === 'number' ? String(jobsToday) : null,
        onPress: onOpenJobs,
      },
      {
        key: 'rating',
        Icon: Star,
        tint: zappy[50],
        fg: zappy[600],
        label: 'Your rating',
        // A worker with no ratings yet has none — not a zero.
        value: worker?.rating ? Number(worker.rating).toFixed(1) : null,
      },
      {
        key: 'accept',
        Icon: CircleCheck,
        tint: slate[100],
        fg: slate[600],
        label: 'Acceptance rate',
        value: acceptRate != null ? `${acceptRate}%` : null,
      },
      // Hours only exists while a session is open; the server nulls
      // `onlineSince` when offline, so the card drops out entirely.
      ...(hours
        ? [
            {
              key: 'hours',
              Icon: Clock,
              tint: zappy[50],
              fg: zappy[600],
              label: "Today's hours",
              value: hours,
            } as StatDef,
          ]
        : []),
    ];
  }, [worker, earningsRupees, jobsToday, onOpenEarnings, onOpenJobs]);

  return (
    <View style={styles.grid}>
      {stats.map((stat) => {
        const body = (
          <Card variant="outline" padding={spacing.base} style={styles.card}>
            <View style={[styles.icon, { backgroundColor: stat.tint }]}>
              <stat.Icon size={16} color={stat.fg} />
            </View>
            <Text variant="label" numberOfLines={2}>
              {stat.label}
            </Text>
            <Text style={styles.value} numberOfLines={1}>
              {stat.value ?? '—'}
            </Text>
          </Card>
        );

        if (!stat.onPress) {
          return (
            <View key={stat.key} style={styles.cell}>
              {body}
            </View>
          );
        }
        return (
          <ScalePressable
            key={stat.key}
            style={styles.cell}
            onPress={stat.onPress}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel={`${stat.label}: ${stat.value ?? 'not available yet'}`}
          >
            {body}
          </ScalePressable>
        );
      })}
    </View>
  );
}

export const WorkerStatGrid = memo(WorkerStatGridBase);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  // Two per row, matching how the website's grid collapses on a phone.
  cell: { flexGrow: 1, flexBasis: '46%' },
  card: { gap: spacing.sm },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `text-xl font-black` on the website's stat cards.
  value: {
    fontFamily: fontFamily.black,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
    color: colors.textHeading,
  },
});
