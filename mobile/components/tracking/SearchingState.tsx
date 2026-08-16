/**
 * Searching — the dispatch waiting state.
 * ----------------------------------------------------------------------------
 * Shown while an order sits at `created` or `searching`. Its job is to make a
 * wait of unknown length feel accounted for rather than abandoned.
 *
 * ── NOTHING HERE IS INVENTED ───────────────────────────────────────────────
 * There is no worker, no ETA, no "3 pros nearby", no countdown. None of that
 * exists yet — dispatch has not assigned anyone — so any of it would be a lie
 * told at the exact moment the customer is deciding whether to trust us.
 *
 * What IS shown is real, and comes from two places:
 *   · the order itself — service, address, price, placed-at time
 *   · `order.dispatch_update` — the live search progress the dispatch worker
 *     already broadcasts: its own `message`, the radius it has reached, and
 *     `step` of `totalSteps` (`jobs/dispatch.worker.js`)
 *
 * The elapsed timer counts from `createdAt`, which is a fact about the past,
 * not a prediction about the future. It deliberately has no target.
 *
 * ── CANCEL ─────────────────────────────────────────────────────────────────
 * Gated on the server's own `canCancel` from `GET /orders/:id/cancel-preview`,
 * and the fee explanation shown is the server's `message` verbatim. The client
 * never decides whether cancelling is allowed or what it costs.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CircleCheck, Clock, MapPin, Radar, ShieldCheck, X } from 'lucide-react-native';
import {
  Appear,
  BottomSheet,
  Button,
  Card,
  Divider,
  SectionTitle,
  Text,
  formatRupees,
} from '../ui';
import { SearchPulse } from './SearchPulse';
import { humanizeCode } from '../catalog/categoryIcons';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';
import type { CancelPreview, Order } from '../../types/api';
import type { OrderDispatchUpdateEvent } from '../../services/socket/events';

export interface SearchingStateProps {
  order: Order;
  /** Latest `order.dispatch_update`, or null before the first one arrives. */
  dispatchUpdate: OrderDispatchUpdateEvent | null;
  cancelPreview?: CancelPreview | null;
  cancelling?: boolean;
  onCancel: (reason?: string) => void;
}

/** mm:ss since the order was placed. */
function useElapsed(since: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    if (!since) return '0:00';
    const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [since, now]);
}

/**
 * Reassurance rotates so a long wait doesn't look frozen. These are statements
 * about how Zappy works, never claims about this particular search.
 */
const REASSURANCE = [
  'Every Zappy pro is background-verified before they take a job.',
  'You only pay once the job is done — nothing is charged while you wait.',
  'You can cancel free of charge until a pro accepts.',
];

function SearchingStateBase({
  order,
  dispatchUpdate,
  cancelPreview,
  cancelling,
  onCancel,
}: SearchingStateProps) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reassuranceIdx, setReassuranceIdx] = useState(0);

  const elapsed = useElapsed(order.createdAt);

  useEffect(() => {
    const timer = setInterval(
      () => setReassuranceIdx((i) => (i + 1) % REASSURANCE.length),
      6000,
    );
    return () => clearInterval(timer);
  }, []);

  const serviceName = humanizeCode(order.service);
  const address = order.pickupLocation?.address;
  const total = order.pricing?.total;

  // Only render progress the server actually sent.
  const step = dispatchUpdate?.step;
  const totalSteps = dispatchUpdate?.totalSteps;
  const hasSteps = typeof step === 'number' && typeof totalSteps === 'number' && totalSteps > 0;

  const canCancel = cancelPreview?.canCancel ?? false;

  return (
    <View style={styles.root}>
      {/* ── The wait ──────────────────────────────────────────────────────── */}
      <Appear style={styles.hero}>
        <SearchPulse size={172}>
          <Radar size={28} color={colors.primary} strokeWidth={1.8} />
        </SearchPulse>

        <Text variant="heading2" align="center" style={styles.title}>
          Finding your professional
        </Text>
        <Text variant="bodySmall" color={colors.textSecondary} align="center">
          We&apos;ve got your booking and we&apos;re reaching out to verified pros
          near you.
        </Text>

        <View style={styles.elapsedRow}>
          <Clock size={13} color={colors.textMuted} />
          <Text variant="caption" color={colors.textSecondary}>
            Searching for {elapsed}
          </Text>
        </View>
      </Appear>

      {/* ── Live dispatch progress — server's own words ───────────────────── */}
      {dispatchUpdate?.message ? (
        <Appear offsetY={6}>
          <Card variant="outline" style={styles.progressCard}>
            <View style={styles.progressRow}>
              <View style={styles.progressDot} />
              <Text variant="bodySmall" weight="semibold" style={styles.flex}>
                {dispatchUpdate.message}
              </Text>
            </View>

            {hasSteps ? (
              <>
                <View style={styles.stepTrack}>
                  {Array.from({ length: totalSteps as number }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.stepSegment,
                        i < (step as number) ? styles.stepSegmentDone : null,
                      ]}
                    />
                  ))}
                </View>
                <Text variant="caption" color={colors.textMuted}>
                  Search area {step} of {totalSteps}
                  {dispatchUpdate.radiusLabel ? ` · within ${dispatchUpdate.radiusLabel}` : ''}
                </Text>
              </>
            ) : dispatchUpdate.radiusLabel ? (
              <Text variant="caption" color={colors.textMuted}>
                Searching within {dispatchUpdate.radiusLabel}
              </Text>
            ) : null}
          </Card>
        </Appear>
      ) : null}

      {/* ── What was booked ──────────────────────────────────────────────── */}
      <Appear offsetY={6}>
        <Card variant="outline">
          <SectionTitle>Your booking</SectionTitle>

          <View style={styles.summaryRow}>
            <View style={styles.summaryIcon}>
              <CircleCheck size={16} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold">
                {serviceName}
              </Text>
              {order.tier && order.tier !== 'standard' ? (
                <Text variant="caption" color={colors.textSecondary}>
                  {order.tier === 'express' ? 'Express' : 'Priority'} matching
                </Text>
              ) : null}
            </View>
          </View>

          {address ? (
            <>
              <Divider style={styles.rowDivider} />
              <View style={styles.summaryRow}>
                <View style={styles.summaryIcon}>
                  <MapPin size={16} color={colors.primary} />
                </View>
                <Text variant="bodySmall" style={styles.flex} numberOfLines={2}>
                  {address}
                </Text>
              </View>
            </>
          ) : null}

          {typeof total === 'number' ? (
            <>
              <Divider style={styles.rowDivider} />
              <View style={styles.totalRow}>
                <Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
                  {order.payment?.method === 'cash' ? 'Pay after the job' : 'Total'}
                </Text>
                <Text variant="heading3">{formatRupees(total)}</Text>
              </View>
            </>
          ) : null}
        </Card>
      </Appear>

      {/* ── Reassurance ──────────────────────────────────────────────────── */}
      <Appear offsetY={6}>
        <View style={styles.reassurance}>
          <ShieldCheck size={15} color={colors.successDark} />
          <Text variant="caption" color={colors.textSecondary} style={styles.flex}>
            {REASSURANCE[reassuranceIdx]}
          </Text>
        </View>
      </Appear>

      {/* ── Cancel — only when the server says so ─────────────────────────── */}
      {canCancel ? (
        <Button
          label="Cancel booking"
          variant="dangerGhost"
          icon={<X size={15} color={colors.error} />}
          onPress={() => setCancelOpen(true)}
          style={styles.cancelButton}
        />
      ) : null}

      <BottomSheet
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
      >
        <Text variant="bodySmall" color={colors.textSecondary}>
          We&apos;ll stop looking for a professional straight away.
        </Text>

        {/* The fee wording is the server's, not ours — it is the only thing
            that knows the grace window and the assignment state. */}
        {cancelPreview?.message ? (
          <View
            style={[
              styles.feeNotice,
              {
                backgroundColor: cancelPreview.isFree ? colors.successTint : colors.warningTint,
              },
            ]}
          >
            <Text
              variant="bodySmall"
              weight="semibold"
              color={cancelPreview.isFree ? colors.successDark : colors.accentDark}
            >
              {cancelPreview.message}
            </Text>
          </View>
        ) : null}

        <Button
          label="Yes, cancel booking"
          variant="danger"
          onPress={() => {
            setCancelOpen(false);
            onCancel('user_cancelled');
          }}
          loading={cancelling}
          fullWidth
          style={styles.sheetPrimary}
        />
        <Button
          label="Keep waiting"
          variant="secondary"
          onPress={() => setCancelOpen(false)}
          fullWidth
          style={styles.sheetSecondary}
        />
      </BottomSheet>
    </View>
  );
}

export const SearchingState = memo(SearchingStateBase);

const styles = StyleSheet.create({
  root: { padding: screenPadding, gap: spacing.lg },
  flex: { flex: 1 },

  hero: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.sm },
  title: { marginTop: spacing.lg, marginBottom: spacing.xs },
  elapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.base,
  },

  progressCard: { gap: spacing.sm },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary,
  },
  stepTrack: { flexDirection: 'row', gap: 4 },
  stepSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceTertiary,
  },
  stepSegmentDone: { backgroundColor: colors.primary },

  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summaryIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.small,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDivider: { marginVertical: spacing.md },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  reassurance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successTint,
    borderRadius: radius.medium,
    padding: spacing.md,
  },

  cancelButton: { alignSelf: 'center' },
  feeNotice: {
    borderRadius: radius.small,
    padding: spacing.md,
    marginTop: spacing.base,
  },
  sheetPrimary: { marginTop: spacing.lg },
  sheetSecondary: { marginTop: spacing.sm },
});
