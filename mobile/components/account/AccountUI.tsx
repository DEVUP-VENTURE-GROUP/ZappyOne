/**
 * Account UI primitives.
 * ----------------------------------------------------------------------------
 * The profile area is a stack of grouped lists. Building each screen out of the
 * same three pieces — a header, a titled section, and a row — is what keeps the
 * spacing, dividers and press behaviour identical across Profile, Addresses,
 * Wallet and Rewards.
 *
 * `AccountSection` owns its own separators rather than each row drawing a
 * bottom border: a row-drawn border leaves a hairline under the last item,
 * which is the usual way these lists end up looking slightly wrong.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Avatar, Card, ScalePressable, SectionTitle, Text } from '../ui';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

// ── Header ──────────────────────────────────────────────────────────────────

export interface ProfileHeaderProps {
  name?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  /** Shown under the name when the server supplied one. */
  caption?: string | null;
  right?: React.ReactNode;
}

export const ProfileHeader = memo(function ProfileHeader({
  name,
  phone,
  avatarUrl,
  caption,
  right,
}: ProfileHeaderProps) {
  return (
    <View style={styles.header}>
      <Avatar uri={avatarUrl} name={name} size={64} />
      <View style={styles.headerBody}>
        {/* Never a placeholder name. Someone who hasn't set one sees an
            invitation to, not a fake identity. */}
        <Text variant="heading2" numberOfLines={1}>
          {name?.trim() || 'Add your name'}
        </Text>
        {phone ? (
          <Text variant="bodySmall" color={colors.textSecondary}>
            {phone}
          </Text>
        ) : null}
        {caption ? (
          <Text variant="caption" color={colors.textMuted}>
            {caption}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
});

// ── Section ─────────────────────────────────────────────────────────────────

export interface AccountSectionProps {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const AccountSection = memo(function AccountSection({
  title,
  children,
  style,
}: AccountSectionProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.section, style]}>
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      <Card variant="outline" padding={0} style={styles.sectionCard}>
        {items.map((child, index) => (
          <View key={index}>
            {/* Separator between rows only — never after the last one. */}
            {index > 0 ? <View style={styles.separator} /> : null}
            {child}
          </View>
        ))}
      </Card>
    </View>
  );
});

// ── Row ─────────────────────────────────────────────────────────────────────

export interface AccountRowProps {
  icon: React.ReactNode;
  label: string;
  /** Secondary line. Omit rather than pass an empty string. */
  detail?: string | null;
  /** Trailing content — a badge, a value, a switch. Replaces the chevron. */
  right?: React.ReactNode;
  onPress?: () => void;
  /** Renders the label in the danger colour. For sign-out and similar. */
  destructive?: boolean;
  /** Tint behind the icon. Defaults to the Zappy blue wash. */
  tint?: string;
  iconColor?: string;
}

export const AccountRow = memo(function AccountRow({
  icon,
  label,
  detail,
  right,
  onPress,
  destructive,
  tint,
  iconColor,
}: AccountRowProps) {
  const body = (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tint ?? colors.primaryTint }]}>
        {icon}
      </View>
      <View style={styles.flex}>
        <Text
          variant="body"
          weight="semibold"
          color={destructive ? colors.error : undefined}
          numberOfLines={1}
        >
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={colors.textMuted} /> : null)}
    </View>
  );

  if (!onPress) return body;

  return (
    <ScalePressable
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {body}
    </ScalePressable>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  headerBody: { flex: 1, gap: 1 },

  section: { gap: spacing.sm },
  sectionCard: { overflow: 'hidden' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    // Indented to clear the icon column, the way grouped lists do it.
    marginLeft: spacing.base + 36 + spacing.md,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
