/**
 * A single at-a-glance figure in the catalog hero.
 * ----------------------------------------------------------------------------
 * Ported from `client/src/components/catalog/CatalogHeader.jsx`:
 *
 *   rounded-full border border-slate-200/70 bg-white/70 px-3 py-1.5
 *   text-[11.5px] font-bold text-slate-600
 *   + a 6px dot tinted with the category accent
 *
 * The website comments this row "Measured from the services actually in this
 * category — no claims", and the mobile callers do the same: every figure is
 * computed from the catalog already in hand, never hardcoded.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../ui';
import { colors, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export interface StatPillProps {
  label: string;
  /** Dot colour — the category accent on the website. Defaults to brand blue. */
  tint?: string;
}

function StatPillBase({ label, tint = colors.primary }: StatPillProps) {
  return (
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text variant="caption" weight="bold" color={slate[600]} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

export const StatPill = memo(StatPillBase);

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  // 11.5px on the web; caption is 12 with a 16 line height, which lands the
  // pill at the same height once the vertical padding is applied.
  label: { fontSize: 11.5 },
});
