/**
 * The dark header shared by Support and Disputes.
 * ----------------------------------------------------------------------------
 * Both website pages use the same bar, differing only in icon, title and the
 * action's label:
 *
 *   header  sticky, rgba(15,23,42,.97), h-14, px-4
 *   back    w-8 h-8 rounded-xl bg-white/10, ChevronLeft 16
 *   title   font-black text-white, with a tinted 16px icon
 *   action  text-xs font-bold text-white bg-white/15 px-3 py-1.5 rounded-full
 *
 * One component rather than two near-identical headers, for the same reason
 * the thread itself is shared: they are the same object and should not drift.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronLeft, Plus, type LucideIcon } from 'lucide-react-native';
import { IconButton, ScalePressable, Text } from '../ui';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';
import { fontFamily } from '../../theme/typography';

export interface SupportHeaderProps {
  title: string;
  icon: LucideIcon;
  /** The website tints this icon per page — violet on Support, blue on Disputes. */
  iconColor: string;
  onBack: () => void;
  /** Renders the "+ …" pill when supplied. */
  actionLabel?: string;
  onAction?: () => void;
}

/** `rgba(15,23,42,0.97)` — flattened; there is nothing behind it to blur. */
const HEADER_BG = colors.textHeading;

function SupportHeaderBase({
  title,
  icon: Icon,
  iconColor,
  onBack,
  actionLabel,
  onAction,
}: SupportHeaderProps) {
  return (
    <View style={styles.root}>
      <IconButton
        icon={<ChevronLeft size={16} color={colors.textInverse} />}
        onPress={onBack}
        variant="plain"
        accessibilityLabel="Go back"
        style={styles.back}
      />

      <View style={styles.titleRow}>
        <Icon size={16} color={iconColor} />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {actionLabel && onAction ? (
        <ScalePressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <View style={styles.action}>
            <Plus size={13} color={colors.textInverse} />
            <Text variant="chip" weight="bold" color={colors.textInverse}>
              {actionLabel}
            </Text>
          </View>
        </ScalePressable>
      ) : null}
    </View>
  );
}

export const SupportHeader = memo(SupportHeaderBase);

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.md,
    backgroundColor: HEADER_BG,
  },
  back: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: radius.small },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: {
    flex: 1,
    fontFamily: fontFamily.black,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: colors.textInverse,
  },
  // `bg-white/15 px-3 py-1.5 rounded-full`
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
});
