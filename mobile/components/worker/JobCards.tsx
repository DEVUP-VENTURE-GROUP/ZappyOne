/**
 * Offer and active-job cards.
 * ----------------------------------------------------------------------------
 * ── THE OFFER CARD IS A DECISION UNDER TIME PRESSURE ───────────────────────
 * A pro has seconds to judge it, so the layout puts the two things that decide
 * it first — what it pays and how far away it is — and everything else after.
 * The countdown is driven by `expiresAt` from the socket payload, not by a
 * client-side timer started on arrival, so a slow render can't make an offer
 * look fresher than it is.
 *
 * `price` and `basePrice` both come from `JobOffer`. When they differ the gap
 * is a real boost the customer paid (`boostAmountPaise` / `urgencyBonusPaise`)
 * and is labelled as such — never presented as Zappy's own bonus.
 *
 * ── ACCEPT IS A SIGNAL, NOT A WIN ──────────────────────────────────────────
 * `POST /orders/:id/accept` only publishes an accept to the dispatch worker,
 * which holds the atomic lock and decides between everyone who tapped at once
 * (`order.service.js` → acceptOffer). The button says "Accept" and the parent
 * waits for `job.assigned` before claiming the job — this component must not
 * imply the tap settled it.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Clock,
  MapPin,
  MessageSquare,
  Navigation,
  Route,
  Zap,
} from 'lucide-react-native';
import { Button, Card, Chip, Divider, StatusBadge, Text, formatRupees } from '../ui';
import { humanizeCode } from '../catalog/categoryIcons';
import { accent, colors, statusColors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import type { JobOffer, Order } from '../../types/api';

// ── Incoming offer ──────────────────────────────────────────────────────────

export interface OfferCardProps {
  offer: JobOffer;
  /** Seconds remaining, computed by the parent from `expiresAt`. */
  secondsLeft: number;
  accepting?: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export const OfferCard = memo(function OfferCard({
  offer,
  secondsLeft,
  accepting,
  onAccept,
  onReject,
}: OfferCardProps) {
  const boosted = offer.price > offer.basePrice;
  const urgent = secondsLeft <= 10;

  return (
    <Card variant="elevated" style={styles.offerCard}>
      <View style={styles.offerHead}>
        <View style={styles.flex}>
          <Text variant="label" color={colors.primary}>
            NEW JOB REQUEST
          </Text>
          <Text variant="heading3">{humanizeCode(offer.service)}</Text>
        </View>

        {/* Countdown, from the server's expiry. */}
        <View style={[styles.timer, urgent ? styles.timerUrgent : null]}>
          <Text
            variant="body"
            weight="bold"
            color={urgent ? colors.error : colors.textHeading}
          >
            {secondsLeft}s
          </Text>
        </View>
      </View>

      {/* Pay first — it is the thing being decided. */}
      <View style={styles.payRow}>
        <Text variant="display" style={styles.payValue}>
          {formatRupees(offer.price)}
        </Text>
        {boosted ? (
          <Chip
            label={`+${formatRupees(offer.price - offer.basePrice)} boost`}
            tone="accent"
            icon={<Zap size={12} color={accent[700]} />}
          />
        ) : null}
      </View>

      <Divider style={styles.offerDivider} />

      <View style={styles.metaRow}>
        {offer.distanceKm ? (
          <View style={styles.metaItem}>
            <Route size={14} color={colors.textSecondary} />
            <Text variant="bodySmall" color={colors.textSecondary}>
              {offer.distanceKm} km away
            </Text>
          </View>
        ) : null}
        {typeof offer.etaMinutes === 'number' ? (
          <View style={styles.metaItem}>
            <Clock size={14} color={colors.textSecondary} />
            <Text variant="bodySmall" color={colors.textSecondary}>
              {offer.etaMinutes} min
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.addressRow}>
        <MapPin size={15} color={colors.primary} />
        <Text variant="bodySmall" style={styles.flex} numberOfLines={2}>
          {offer.pickupAddress}
        </Text>
      </View>

      {offer.description ? (
        <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
          “{offer.description}”
        </Text>
      ) : null}

      <View style={styles.offerActions}>
        <Button
          label="Decline"
          variant="secondary"
          onPress={onReject}
          style={styles.flex}
        />
        <Button
          label="Accept"
          variant="success"
          onPress={onAccept}
          loading={accepting}
          style={styles.acceptButton}
        />
      </View>
    </Card>
  );
});

// ── Active job ──────────────────────────────────────────────────────────────

export interface ActiveJobCardProps {
  order: Order;
  busy?: boolean;
  /** The single next lifecycle action, decided by the parent from status. */
  actionLabel?: string | null;
  onAction?: () => void;
  onChat: () => void;
  onNavigate?: () => void;
}

export const ActiveJobCard = memo(function ActiveJobCard({
  order,
  busy,
  actionLabel,
  onAction,
  onChat,
  onNavigate,
}: ActiveJobCardProps) {
  const palette = statusColors[order.status] ?? statusColors.assigned;
  const total = order.pricing?.total;

  return (
    <Card variant="outline" style={styles.jobCard}>
      <View style={styles.jobHead}>
        <View style={styles.flex}>
          <Text variant="label">CURRENT JOB</Text>
          <Text variant="heading3">{humanizeCode(order.service)}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      <View style={styles.addressRow}>
        <MapPin size={15} color={palette.fg} />
        <Text variant="bodySmall" style={styles.flex} numberOfLines={2}>
          {order.pickupLocation?.address}
        </Text>
      </View>

      {typeof total === 'number' ? (
        <View style={styles.jobPayRow}>
          <Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
            {order.payment?.method === 'cash' ? 'Collect in cash' : 'Paid online'}
          </Text>
          <Text variant="heading3">{formatRupees(total)}</Text>
        </View>
      ) : null}

      <View style={styles.jobActions}>
        <Button
          label="Chat"
          variant="secondary"
          size="small"
          icon={<MessageSquare size={14} color={colors.primary} />}
          onPress={onChat}
        />
        {onNavigate ? (
          <Button
            label="Navigate"
            variant="secondary"
            size="small"
            icon={<Navigation size={14} color={colors.primary} />}
            onPress={onNavigate}
          />
        ) : null}
      </View>

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          loading={busy}
          fullWidth
          size="large"
          style={styles.primaryAction}
        />
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },

  offerCard: { gap: spacing.md, borderWidth: 1.5, borderColor: colors.primary },
  offerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  timer: {
    minWidth: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center',
  },
  timerUrgent: { backgroundColor: colors.errorTint },

  payRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  payValue: { letterSpacing: -1 },
  offerDivider: { marginVertical: 0 },

  metaRow: { flexDirection: 'row', gap: spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },

  offerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  acceptButton: { flex: 1.4 },

  jobCard: { gap: spacing.md },
  jobHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  jobPayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  jobActions: { flexDirection: 'row', gap: spacing.sm },
  primaryAction: { marginTop: spacing.xs },
});
