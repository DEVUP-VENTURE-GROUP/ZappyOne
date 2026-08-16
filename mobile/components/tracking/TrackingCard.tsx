/**
 * Tracking card — the sheet over the live map.
 * ----------------------------------------------------------------------------
 * One card that re-dresses itself per status rather than five near-identical
 * cards, so the layout can't drift between states.
 *
 * Statuses handled here are exactly the ones the backend defines
 * (`order.model.js` → ORDER_STATUSES): assigned, on_the_way, arrived,
 * in_progress, completed. `created`/`searching` belong to the searching state,
 * and `cancelled`/`failed` to the outcome cards.
 *
 * ── ETA ────────────────────────────────────────────────────────────────────
 * Shown only while `on_the_way`, because that is the only status for which
 * `eta.service.js` emits `order.eta`. Once the pro has arrived there is nothing
 * left to estimate, and holding the last ETA on screen would be stating a
 * journey that already finished.
 *
 * Ticks are delta-suppressed server-side — first fix, ≥30s change, or the
 * arriving-soon flag flipping — so a quiet minute is normal and is NOT rendered
 * as a stall.
 *
 * ── CONTACT ────────────────────────────────────────────────────────────────
 * Chat, and only chat. The API never exposes a worker's phone number to a
 * customer and there is no call-masking route, so a "Call" button would be a
 * dead control. The chat endpoint is real: `/orders/:id/chat`.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  CircleCheck,
  Clock,
  KeyRound,
  MapPin,
  MessageSquare,
  Navigation,
  Star,
  Wrench,
  X,
} from 'lucide-react-native';
import { Appear, Avatar, Button, Card, Divider, Text, formatRupees } from '../ui';
import { humanizeCode } from '../catalog/categoryIcons';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { screenPadding, spacing } from '../../theme/spacing';
import type { CancelPreview, Order, OrderStatus } from '../../types/api';
import type { OrderEtaEvent } from '../../services/socket/events';

export interface TrackingCardProps {
  order: Order;
  /** Latest `order.eta`. Only meaningful while `on_the_way`. */
  eta: OrderEtaEvent | null;
  cancelPreview?: CancelPreview | null;
  onChat: () => void;
  onCancel: () => void;
  onRate?: () => void;
}

/** Headline + supporting line per status. No status here is invented. */
const COPY: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  assigned: {
    title: 'Professional assigned',
    body: 'They have accepted your booking and will set off shortly.',
  },
  on_the_way: {
    title: 'On the way to you',
    body: 'You can follow their progress on the map.',
  },
  arrived: {
    title: 'Arrived at your location',
    body: 'Share your start code so they can begin.',
  },
  in_progress: {
    title: 'Service in progress',
    body: 'Your professional is working on the job now.',
  },
  completed: {
    title: 'Service completed',
    body: 'Thanks for booking with Zappy.',
  },
};

const ACCENT: Partial<Record<OrderStatus, string>> = {
  assigned: colors.primary,
  on_the_way: colors.primary,
  arrived: colors.accent,
  in_progress: colors.accent,
  completed: colors.success,
};

function StatusIcon({ status }: { status: OrderStatus }) {
  const color = colors.textInverse;
  if (status === 'on_the_way') return <Navigation size={18} color={color} />;
  if (status === 'arrived') return <MapPin size={18} color={color} />;
  if (status === 'in_progress') return <Wrench size={18} color={color} />;
  if (status === 'completed') return <CircleCheck size={18} color={color} />;
  return <CircleCheck size={18} color={color} />;
}

function TrackingCardBase({
  order,
  eta,
  cancelPreview,
  onChat,
  onCancel,
  onRate,
}: TrackingCardProps) {
  const status = order.status;
  const copy = COPY[status];
  const accent = ACCENT[status] ?? colors.primary;

  // ETA belongs to `on_the_way` alone — see the header.
  const showEta = status === 'on_the_way' && typeof eta?.etaMinutes === 'number';
  const arrivingSoon = status === 'on_the_way' && eta?.isArrivingSoon === true;

  const total = order.pricing?.total;
  const canCancel = cancelPreview?.canCancel ?? false;

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />

      <Appear offsetY={4}>
        {/* ── Status ───────────────────────────────────────────────────── */}
        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, { backgroundColor: accent }]}>
            <StatusIcon status={status} />
          </View>
          <View style={styles.flex}>
            <Text variant="heading3">{copy?.title ?? humanizeCode(status)}</Text>
            {copy?.body ? (
              <Text variant="caption" color={colors.textSecondary}>
                {copy.body}
              </Text>
            ) : null}
          </View>

          {showEta ? (
            <View style={styles.etaBlock}>
              <Text variant="heading2" color={colors.primary}>
                {Math.round(eta!.etaMinutes as number)}
              </Text>
              <Text variant="caption" color={colors.textMuted}>
                min away
              </Text>
            </View>
          ) : null}
        </View>

        {arrivingSoon ? (
          <View style={styles.arrivingBanner}>
            <Clock size={13} color={colors.accentDark} />
            <Text variant="caption" color={colors.accentDark} style={styles.flex}>
              Almost there — please be ready to meet them.
            </Text>
          </View>
        ) : null}

        {/* ── Start code — the server's OTP, shown only when it sends one ── */}
        {order.otp && (status === 'assigned' || status === 'on_the_way' || status === 'arrived') ? (
          <View style={styles.otpBlock}>
            <View style={styles.otpLabel}>
              <KeyRound size={13} color={colors.accentDark} />
              <Text variant="caption" color={colors.accentDark}>
                START CODE
              </Text>
            </View>
            <Text variant="heading2" style={styles.otpValue}>
              {order.otp}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              Share this with your pro so they can start.
            </Text>
          </View>
        ) : null}

        <Divider style={styles.divider} />

        {/* ── Who and what ─────────────────────────────────────────────── */}
        <View style={styles.workerRow}>
          <Avatar name={order.workerName ?? undefined} size={44} />
          <View style={styles.flex}>
            <Text variant="body" weight="semibold" numberOfLines={1}>
              {/* Never a placeholder name — if the controller didn't decorate
                  one, say what is true instead of inventing a person. */}
              {order.workerName ?? 'Your professional'}
            </Text>
            <View style={styles.workerMeta}>
              {typeof order.workerRating === 'number' ? (
                <View style={styles.metaItem}>
                  <Star size={12} color={colors.accent} fill={colors.accent} />
                  <Text variant="caption" color={colors.textSecondary}>
                    {order.workerRating.toFixed(1)}
                  </Text>
                </View>
              ) : null}
              {typeof order.workerJobs === 'number' ? (
                <Text variant="caption" color={colors.textSecondary}>
                  {order.workerJobs} {order.workerJobs === 1 ? 'job' : 'jobs'}
                </Text>
              ) : null}
            </View>
          </View>

          {status !== 'completed' ? (
            <Button
              label="Chat"
              variant="secondary"
              size="small"
              icon={<MessageSquare size={15} color={colors.primary} />}
              onPress={onChat}
            />
          ) : null}
        </View>

        <View style={styles.serviceRow}>
          <Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
            {humanizeCode(order.service)}
          </Text>
          {typeof total === 'number' ? (
            <Text variant="bodySmall" weight="semibold">
              {formatRupees(total)}
              {order.payment?.method === 'cash' ? ' · cash' : ''}
            </Text>
          ) : null}
        </View>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        {status === 'completed' && onRate && order.userRating == null ? (
          <Button label="Rate your experience" onPress={onRate} fullWidth style={styles.action} />
        ) : null}

        {canCancel && status !== 'completed' ? (
          <Button
            label="Cancel booking"
            variant="dangerGhost"
            size="small"
            icon={<X size={14} color={colors.error} />}
            onPress={onCancel}
            style={styles.cancel}
          />
        ) : null}
      </Appear>
    </View>
  );
}

export const TrackingCard = memo(TrackingCardBase);

const styles = StyleSheet.create({
  flex: { flex: 1 },

  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.extraLarge,
    borderTopRightRadius: radius.extraLarge,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    ...shadows.softLarge,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.base,
  },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaBlock: { alignItems: 'flex-end' },

  arrivingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningTint,
    borderRadius: radius.small,
    padding: spacing.sm,
    marginTop: spacing.md,
  },

  otpBlock: {
    backgroundColor: colors.accentTint,
    borderRadius: radius.medium,
    padding: spacing.base,
    marginTop: spacing.md,
    gap: 2,
  },
  otpLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  otpValue: { letterSpacing: 6 },

  divider: { marginVertical: spacing.base },

  workerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  workerMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 1 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },

  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },

  action: { marginTop: spacing.base },
  cancel: { alignSelf: 'center', marginTop: spacing.sm },
});
