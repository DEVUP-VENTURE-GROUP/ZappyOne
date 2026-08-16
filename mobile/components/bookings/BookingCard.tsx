/**
 * Booking card — one row of order history.
 * ----------------------------------------------------------------------------
 * Every value comes off the `Order` the API already returns. There is no
 * derived rating, no invented duration, no "you saved ₹X". If the server
 * didn't send it, the row doesn't show it.
 *
 * ── STATUS-SPECIFIC TREATMENT ──────────────────────────────────────────────
 * The status drives three things, all from `statusColors` in the theme so the
 * booking list, the tracking screen and the chips can't drift apart:
 *   · a left rail in the status colour, which is what makes the list scannable
 *   · the icon tile's tint
 *   · the badge
 *
 * Live bookings additionally get a pulsing dot. Colour alone never carries the
 * status — the badge always spells it out, per the accessibility rule in
 * `theme/colors.ts`.
 *
 * ── PRICE ──────────────────────────────────────────────────────────────────
 * `pricing.total` is the snapshot locked onto the order at creation. It is
 * shown as-is and never recomputed. Orders that never got priced (a failure
 * before the pricing call) simply show no figure rather than "₹0", which would
 * claim the job was free.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight, RotateCcw } from 'lucide-react-native';
import { Button, Card, ScalePressable, StatusBadge, Text, formatRupees } from '../ui';
import { humanizeCode, resolveServiceIcon } from '../catalog/categoryIcons';
import { colors, statusColors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { ACTIVE_ORDER_STATUSES, type Order } from '../../types/api';

export interface BookingCardProps {
  order: Order;
  onPress: (order: Order) => void;
  onRebook?: (order: Order) => void;
  rebooking?: boolean;
}

/** "15 Aug", or "15 Aug 25" once the year differs from today's. */
function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: '2-digit' }),
  });
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** Slow breathing dot. Only on live bookings, and never in reduced motion. */
function LiveDot({ color }: { color: string }) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [pulse, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.65 }));

  return <Animated.View style={[styles.liveDot, { backgroundColor: color }, style]} />;
}

function BookingCardBase({ order, onPress, onRebook, rebooking }: BookingCardProps) {
  const palette = statusColors[order.status] ?? statusColors.created;
  const Icon = resolveServiceIcon(undefined, order.service);
  const isLive = (ACTIVE_ORDER_STATUSES as readonly string[]).includes(order.status);
  const total = order.pricing?.total;

  // Rebook exists server-side (`POST /orders/:id/rebook`) and only makes sense
  // once this order is finished with.
  const canRebook =
    Boolean(onRebook) &&
    (order.status === 'completed' || order.status === 'cancelled' || order.status === 'failed');

  const date = formatDate(order.createdAt);
  const time = formatTime(order.createdAt);

  return (
    // The card itself is NOT pressable. "Book again" is a button, and nesting
    // one pressable inside another is invalid on web and ambiguous on native —
    // a tap on the inner control also fires the outer one. So only the
    // information area opens the booking, and the action sits outside it.
    <Card variant="outline" padding={0} style={styles.card}>
      {/* Status rail. Absolutely positioned because Card wraps its children in
          a single column View — a sibling flex row would collapse to zero
          height here. `overflow: hidden` on the card clips it to the radius. */}
      <View style={[styles.rail, { backgroundColor: palette.fg }]} />

      <View style={styles.body}>
        <ScalePressable
          onPress={() => onPress(order)}
          scaleTo={0.99}
          style={styles.tapArea}
          accessibilityRole="button"
          accessibilityLabel={`${humanizeCode(order.service)}, ${order.status}, ${date}`}
          accessibilityHint="Opens this booking"
        >
          <View style={styles.topRow}>
          <View style={[styles.iconTile, { backgroundColor: palette.bg }]}>
            <Icon size={20} strokeWidth={1.9} color={palette.fg} />
          </View>

          <View style={styles.flex}>
            <Text variant="body" weight="semibold" numberOfLines={1}>
              {humanizeCode(order.service)}
            </Text>
            <View style={styles.metaRow}>
              {date ? (
                <Text variant="caption" color={colors.textSecondary}>
                  {date}
                  {time ? ` · ${time}` : ''}
                </Text>
              ) : null}
            </View>
          </View>

            <ChevronRight size={18} color={colors.textMuted} />
          </View>

          <View style={styles.bottomRow}>
          <View style={styles.statusWrap}>
            {isLive ? <LiveDot color={palette.fg} /> : null}
            <StatusBadge status={order.status} />
          </View>

          {/* No figure at all when the order never got priced — "₹0" would
              claim the job was free. */}
          {typeof total === 'number' && total > 0 ? (
            <Text variant="body" weight="semibold">
              {formatRupees(total)}
            </Text>
            ) : null}
          </View>
        </ScalePressable>

        {canRebook ? (
          <Button
            label="Book again"
            variant="secondary"
            size="small"
            icon={<RotateCcw size={14} color={colors.primary} />}
            onPress={() => onRebook?.(order)}
            loading={rebooking}
            style={styles.rebook}
          />
        ) : null}
      </View>
    </Card>
  );
}

export const BookingCard = memo(BookingCardBase);

const styles = StyleSheet.create({
  flex: { flex: 1 },

  card: { overflow: 'hidden' },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  body: {
    padding: spacing.base,
    // Clears the rail so text never sits on top of it.
    paddingLeft: spacing.base + 4,
    gap: spacing.md,
  },
  /** The information area — everything except the rebook action. */
  tapArea: { alignSelf: 'stretch', gap: spacing.md },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 1 },

  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },

  rebook: { alignSelf: 'flex-start' },
});
