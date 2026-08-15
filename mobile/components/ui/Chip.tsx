/**
 * Chips, badges, and the order status badge.
 * ----------------------------------------------------------------------------
 * Ports `.chip` and its variants (`chip-blue`, `chip-success`, `chip-accent`,
 * `chip-neutral`, `chip-red`): a pill with 12px semibold text.
 *
 * `StatusBadge` maps an order status to its colour pair AND a human label.
 * Status is never communicated by colour alone — the label always ships with
 * it, which is the accessibility requirement.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ScalePressable } from './Pressable';
import { Text } from './Text';
import { colors, statusColors, zappy, success, accent, danger, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { pressScale } from '../../theme/animation';
import type { OrderStatus } from '../../types/api';

export type ChipTone = 'blue' | 'success' | 'accent' | 'neutral' | 'red';

const TONES: Record<ChipTone, { bg: string; fg: string }> = {
  blue: { bg: zappy[50], fg: zappy[700] },
  success: { bg: success[50], fg: success[700] },
  accent: { bg: accent[50], fg: accent[700] },
  neutral: { bg: slate[100], fg: slate[600] },
  red: { bg: danger[50], fg: danger[600] },
};

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  icon?: React.ReactNode;
  /** Renders as a selectable filter chip. */
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function ChipBase({
  label,
  tone = 'neutral',
  icon,
  selected,
  onPress,
  style,
  testID,
}: ChipProps) {
  // A selected filter chip inverts to solid brand blue, like the website's
  // active category pill.
  const palette = selected
    ? { bg: zappy[600], fg: colors.textInverse }
    : TONES[tone];

  const body = (
    <View style={[styles.chip, { backgroundColor: palette.bg }, style]}>
      {icon}
      <Text variant="chip" color={palette.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;

  return (
    <ScalePressable
      onPress={onPress}
      scaleTo={pressScale.tile}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      testID={testID}
    >
      {body}
    </ScalePressable>
  );
}

export const Chip = memo(ChipBase);

/** Human-readable order status labels — shared with the tracking timeline. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  created: 'Booking created',
  searching: 'Finding a pro',
  assigned: 'Pro assigned',
  on_the_way: 'On the way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

export interface StatusBadgeProps {
  status: OrderStatus;
  style?: StyleProp<ViewStyle>;
}

function StatusBadgeBase({ status, style }: StatusBadgeProps) {
  const palette = statusColors[status] ?? statusColors.created;
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }, style]}>
      <Text variant="chip" color={palette.fg} numberOfLines={1}>
        {STATUS_LABEL[status] ?? status}
      </Text>
    </View>
  );
}

export const StatusBadge = memo(StatusBadgeBase);

export interface BadgeProps {
  /** Numeric count. Values above 99 render as "99+". */
  count: number;
  style?: StyleProp<ViewStyle>;
}

/** Small count bubble for the notification bell. */
function BadgeBase({ count, style }: BadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <View
      style={[styles.badge, style]}
      accessibilityLabel={`${count} unread`}
      accessibilityRole="text"
    >
      <Text variant="caption" color={colors.textInverse} weight="bold" style={styles.badgeText}>
        {label}
      </Text>
    </View>
  );
}

export const Badge = memo(BadgeBase);

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    alignSelf: 'flex-start',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: danger[500],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 14,
  },
});
