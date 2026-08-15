/**
 * Small shared primitives: Divider, Avatar, Rating, PriceRow, ScreenHeader.
 * Kept together because each is a handful of lines and they are almost always
 * imported alongside one another.
 */

import React, { memo } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronLeft, Star, User } from 'lucide-react-native';
import { IconButton } from './IconButton';
import { Text, Heading } from './Text';
import { colors, slate, accent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { sizes } from '../../theme/dimensions';

/** `.divider` — a hairline rule with vertical breathing room. */
function DividerBase({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}
export const Divider = memo(DividerBase);

export interface AvatarProps {
  uri?: string | null;
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** Circular avatar. Falls back to initials, then to a generic person icon. */
function AvatarBase({ uri, name, size = sizes.avatarMedium, style }: AvatarProps) {
  const initials = (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          // Downscale in the decoder rather than holding a full-res bitmap.
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : initials ? (
        <Text weight="bold" color={colors.primary} style={{ fontSize: size * 0.36 }}>
          {initials}
        </Text>
      ) : (
        <User size={size * 0.5} color={colors.primary} />
      )}
    </View>
  );
}
export const Avatar = memo(AvatarBase);

export interface RatingProps {
  value?: number | null;
  /** Number of completed jobs, shown alongside when supplied. */
  count?: number | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

function RatingBase({ value, count, size = 14, style }: RatingProps) {
  if (value == null) return null;
  return (
    <View
      style={[styles.rating, style]}
      accessibilityLabel={`Rated ${value.toFixed(1)} out of 5${
        count ? `, ${count} jobs completed` : ''
      }`}
    >
      <Star size={size} color={accent[500]} fill={accent[500]} />
      <Text variant="bodySmall" weight="semibold" color={colors.textPrimary}>
        {value.toFixed(1)}
      </Text>
      {count ? <Text variant="bodySmall">({count})</Text> : null}
    </View>
  );
}
export const Rating = memo(RatingBase);

export interface PriceRowProps {
  label: string;
  /** Rupee amount. Formatted with Indian digit grouping. */
  value: number | string;
  emphasis?: boolean;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Formats a rupee amount the way the website does (en-IN grouping). */
export function formatRupees(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function PriceRowBase({ label, value, emphasis, muted, style }: PriceRowProps) {
  const display = typeof value === 'number' ? formatRupees(value) : value;
  return (
    <View style={[styles.priceRow, style]}>
      <Text
        variant={emphasis ? 'heading3' : 'body'}
        color={muted ? colors.textSecondary : undefined}
      >
        {label}
      </Text>
      <Text
        variant={emphasis ? 'heading3' : 'body'}
        weight={emphasis ? 'bold' : 'semibold'}
        color={muted ? colors.textSecondary : colors.textHeading}
      >
        {display}
      </Text>
    </View>
  );
}
export const PriceRow = memo(PriceRowBase);

export interface ScreenHeaderProps {
  title?: string;
  onBack?: () => void;
  /** Rendered at the trailing edge — e.g. a notification bell. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Consistent back-and-title bar, matching the website's `.page-header`. */
function ScreenHeaderBase({ title, onBack, right, style }: ScreenHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      {onBack ? (
        <IconButton
          icon={<ChevronLeft size={20} color={colors.textHeading} />}
          onPress={onBack}
          accessibilityLabel="Go back"
        />
      ) : null}
      {title ? (
        <Heading level={3} style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Heading>
      ) : (
        <View style={styles.headerTitle} />
      )}
      {right}
    </View>
  );
}
export const ScreenHeader = memo(ScreenHeaderBase);

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginVertical: spacing.base,
  },
  avatar: {
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: sizes.headerHeight,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    flex: 1,
  },
});

export { slate };
