/**
 * The heading above a content section.
 * ----------------------------------------------------------------------------
 * A direct port of `SectionHeader` in `client/src/pages/HomePage.jsx`:
 *
 *   <div className="flex items-center justify-between mb-4">
 *     <h2 className="text-[20px] font-bold text-slate-900 tracking-tight" />
 *     <span className="text-[10px] font-medium px-2 py-0.5 rounded-md …" />   ← badge
 *     <button className="text-[14px] font-semibold text-zappy-600">
 *       See all <ArrowRight size={15} strokeWidth={2.5} />
 *     </button>
 *   </div>
 *
 * ── WHY THIS EXISTS ALONGSIDE `SectionTitle` ───────────────────────────────
 * They are two different things on the website and mobile had only one of them.
 *
 *   SectionHeader  20px bold navy, sentence case   → content sections
 *   SectionTitle   12px semibold uppercase grey    → settings groups, form labels
 *
 * The website uses the small `.section-title` class in exactly one place —
 * the settings groups on ProfilePage — and the big `<h2>` everywhere else.
 * Mobile was using the small one for everything, so "Popular Services" rendered
 * as a muted micro-label instead of the page's loudest element.
 *
 * `SectionTitle` is unchanged and still correct where it is genuinely a group
 * label; this is not a replacement for it.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { ScalePressable } from './Pressable';
import { Text } from './Text';
import { colors, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export interface SectionHeaderProps {
  title: string;
  /** Small pill beside the title — the website's "Most Booked", "All Brands". */
  badge?: string;
  /** Badge colours. Defaults to the site's `bg-slate-100 text-slate-800`. */
  badgeTone?: { bg: string; fg: string };
  /** Renders the "See all →" affordance when provided. */
  onSeeAll?: () => void;
  /** Overrides the "See all" wording where the site uses something else. */
  seeAllLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_BADGE = { bg: slate[100], fg: slate[800] };

function SectionHeaderBase({
  title,
  badge,
  badgeTone = DEFAULT_BADGE,
  onSeeAll,
  seeAllLabel = 'See all',
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.left}>
        <Text variant="sectionHeading" numberOfLines={1} style={styles.shrink}>
          {title}
        </Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badgeTone.bg }]}>
            <Text variant="caption" weight="medium" color={badgeTone.fg}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>

      {onSeeAll ? (
        <ScalePressable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`${seeAllLabel}: ${title}`}
          hitSlop={8}
        >
          <View style={styles.seeAll}>
            <Text variant="bodySmall" weight="semibold" color={colors.primary}>
              {seeAllLabel}
            </Text>
            <ArrowRight size={15} strokeWidth={2.5} color={colors.primary} />
          </View>
        </ScalePressable>
      ) : null}
    </View>
  );
}

export const SectionHeader = memo(SectionHeaderBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    // `mb-4` on the website.
    marginBottom: spacing.base,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  shrink: { flexShrink: 1 },
  badge: {
    // `px-2 py-0.5 rounded-md`
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.small,
  },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
