/**
 * Dispatch outcomes — how a search ends.
 * ----------------------------------------------------------------------------
 * Three terminal cards for the three ways `searching` resolves, all driven by
 * `order.status`, which is the server's word:
 *
 *   assigned   a pro took the job          → `WorkerFound`
 *   cancelled  the customer or a job ended it → `BookingCancelled`
 *   failed     dispatch gave up             → `BookingFailed`
 *
 * `WorkerFound` shows the worker's name, rating and job count ONLY when the
 * controller actually decorated them onto the order (`order.controller.js`
 * populates `workerName` / `workerRating` / `workerJobs` on assignment). When a
 * field is absent it is omitted — never defaulted to a placeholder name or a
 * flattering rating.
 *
 * `BookingFailed` states the refund position in the conditional the server
 * supports: `markOrderFailed` issues a full refund for prepaid orders, and a
 * cash order was never charged. Neither branch promises a timeline, because the
 * order carries none.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CircleAlert, CircleCheck, CircleX, Star } from 'lucide-react-native';
import { Appear, Button, Card, Text } from '../ui';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';
import type { Order } from '../../types/api';

interface OutcomeShellProps {
  icon: React.ReactNode;
  tint: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}

function OutcomeShell({ icon, tint, title, body, children }: OutcomeShellProps) {
  return (
    <Appear style={styles.root}>
      <View style={[styles.badge, { backgroundColor: tint }]}>{icon}</View>
      <Text variant="heading2" align="center" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodySmall" color={colors.textSecondary} align="center">
        {body}
      </Text>
      {children}
    </Appear>
  );
}

/** `assigned` — a pro accepted. Handed straight to the live tracking UI. */
export const WorkerFound = memo(function WorkerFound({ order }: { order: Order }) {
  const name = order.workerName;
  const rating = order.workerRating;
  const jobs = order.workerJobs;

  return (
    <OutcomeShell
      icon={<CircleCheck size={30} color={colors.successDark} />}
      tint={colors.successTint}
      title="Professional assigned"
      body={
        name
          ? `${name} has accepted your booking and is getting ready.`
          : 'A professional has accepted your booking and is getting ready.'
      }
    >
      {/* Rendered only from fields the controller actually decorated. */}
      {name && (typeof rating === 'number' || typeof jobs === 'number') ? (
        <Card variant="outline" style={styles.workerCard}>
          <Text variant="body" weight="semibold">
            {name}
          </Text>
          <View style={styles.workerMeta}>
            {typeof rating === 'number' ? (
              <View style={styles.metaItem}>
                <Star size={13} color={colors.accent} fill={colors.accent} />
                <Text variant="caption" color={colors.textSecondary}>
                  {rating.toFixed(1)}
                </Text>
              </View>
            ) : null}
            {typeof jobs === 'number' ? (
              <Text variant="caption" color={colors.textSecondary}>
                {jobs} {jobs === 1 ? 'job' : 'jobs'} completed
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}
    </OutcomeShell>
  );
});

/** `cancelled` — by the customer, a worker chain, or the stale-order worker. */
export const BookingCancelled = memo(function BookingCancelled({
  onRebook,
  onDone,
}: {
  onRebook?: () => void;
  onDone: () => void;
}) {
  return (
    <OutcomeShell
      icon={<CircleX size={30} color={colors.errorDark} />}
      tint={colors.errorTint}
      title="Booking cancelled"
      body="We've stopped looking for a professional. Nothing further will be charged for this booking."
    >
      <View style={styles.actions}>
        {onRebook ? <Button label="Book again" onPress={onRebook} fullWidth /> : null}
        <Button label="Back to home" variant="secondary" onPress={onDone} fullWidth />
      </View>
    </OutcomeShell>
  );
});

/** `failed` — dispatch exhausted its search without an acceptance. */
export const BookingFailed = memo(function BookingFailed({
  order,
  onRebook,
  onDone,
}: {
  order: Order;
  onRebook?: () => void;
  onDone: () => void;
}) {
  const wasPrepaid = order.payment?.method !== 'cash' && order.payment?.status === 'paid';

  return (
    <OutcomeShell
      icon={<CircleAlert size={30} color={colors.accentDark} />}
      tint={colors.warningTint}
      title="No one could take this job"
      body="We searched your whole area and couldn't find an available professional. This is on us, not you."
    >
      <Card variant="outline" style={styles.refundCard}>
        <Text variant="bodySmall" color={colors.textSecondary}>
          {wasPrepaid
            ? 'Your payment is being refunded in full.'
            : 'You were not charged for this booking.'}
        </Text>
      </Card>

      <View style={styles.actions}>
        {onRebook ? <Button label="Try again" onPress={onRebook} fullWidth /> : null}
        <Button label="Back to home" variant="secondary" onPress={onDone} fullWidth />
      </View>
    </OutcomeShell>
  );
});

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    padding: screenPadding,
    paddingTop: spacing.xxl,
    gap: spacing.xs,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  title: { marginBottom: spacing.xxs },

  workerCard: { width: '100%', marginTop: spacing.lg, alignItems: 'center' },
  workerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.xxs,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },

  refundCard: {
    width: '100%',
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.medium,
  },
  actions: { width: '100%', gap: spacing.sm, marginTop: spacing.xl },
});
