/**
 * LiveServiceCard — one bookable service, with the headings it covers.
 * ----------------------------------------------------------------------------
 * A port of `ServiceCard` in `client/src/components/home/LiveServices.jsx`:
 *
 *   <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200/70">
 *     <button className="flex w-full items-center gap-4 p-4">
 *       <span className="h-12 w-12 rounded-2xl bg-indigo-50">icon</span>
 *       <span className="min-w-0 flex-1">
 *         name + Popular pill
 *         <span className="text-xs text-slate-500">description || tagline</span>
 *       </span>
 *       <ChevronRight className="text-slate-300" />
 *     </button>
 *     <div className="border-t border-slate-100">…coverage carousel…</div>
 *   </div>
 *
 * ── WHY THIS REPLACED THE OLD `catalog/ServiceCard` ────────────────────────
 * That one took a `ServiceCatalogItem` — the OLD `/catalog/services` model,
 * with a price, a duration and a category. This takes a `LiveCatalogService`,
 * which has none of those and instead carries `coverage` and `highlights`.
 * They are different rows from different endpoints, so one component could
 * not honestly serve both. Once Home moved to the live catalog the old card
 * had no callers left and was deleted.
 *
 * The "Popular" pill IS uppercase, unlike `CategoryTile`'s label: it is a
 * fixed English word we control, not an operator-typed name that has to fit.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useCallback } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { CategoryTile, CATEGORY_TILE_WIDTH } from './CategoryTile';
import { iconFor } from './liveCatalog';
import { HScrollRail } from '../ui/HScrollRail';
import { ScalePressable } from '../ui/Pressable';
import { Text } from '../ui/Text';
import { colors, indigo } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import type { LiveCatalogCategory, LiveCatalogService } from '../../types/api';

export interface LiveServiceCardProps {
  service: LiveCatalogService;
  onPress?: (service: LiveCatalogService) => void;
  onPressCategory?: (category: LiveCatalogCategory, service: LiveCatalogService) => void;
  /** Hides the coverage rail — the service detail screen renders its own. */
  showCoverage?: boolean;
  testID?: string;
}

function LiveServiceCardBase({
  service,
  onPress,
  onPressCategory,
  showCoverage = true,
  testID,
}: LiveServiceCardProps) {
  const Icon = iconFor(service.icon);
  const blurb = service.description || service.tagline;
  const coverage = showCoverage ? service.coverage : [];

  const handlePress = useCallback(() => onPress?.(service), [onPress, service]);

  return (
    <View style={styles.card} testID={testID}>
      <ScalePressable
        onPress={onPress ? handlePress : undefined}
        accessibilityRole="button"
        accessibilityLabel={service.name}
        accessibilityHint={blurb || undefined}
      >
        <View style={styles.row}>
          <View style={styles.iconChip}>
            {service.imageUrl ? (
              <Image
                source={{ uri: service.imageUrl }}
                style={styles.iconImage}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Icon size={22} strokeWidth={1.75} color={indigo[600]} />
            )}
          </View>

          {/* min-w-0 flex-1: without this a long service name pushes the
              chevron off a 360pt screen instead of wrapping. */}
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text
                variant="body"
                weight="black"
                color={colors.textHeading}
                numberOfLines={2}
                style={styles.title}
              >
                {service.name}
              </Text>
              {service.isPopular ? (
                <View style={styles.popular}>
                  <Text variant="navLabel" weight="black" color={indigo[600]}>
                    POPULAR
                  </Text>
                </View>
              ) : null}
            </View>
            {blurb ? (
              <Text variant="bodySmall" numberOfLines={2} style={styles.blurb}>
                {blurb}
              </Text>
            ) : null}
          </View>

          <ChevronRight size={18} color={colors.borderStrong} />
        </View>
      </ScalePressable>

      {coverage.length > 0 ? (
        <View style={styles.coverage}>
          <HScrollRail
            itemWidth={CATEGORY_TILE_WIDTH}
            gap={10}
            contentPadding={spacing.base}
            verticalPadding={14}
            fadeColor={colors.surface}
          >
            {coverage.map((group) => (
              <CategoryTile
                key={group.code}
                name={group.name}
                code={group.code}
                count={group.problems.length}
                imageUrl={group.imageUrl}
                onPress={
                  onPressCategory ? () => onPressCategory(group, service) : undefined
                }
              />
            ))}
          </HScrollRail>
        </View>
      ) : null}
    </View>
  );
}

export const LiveServiceCard = memo(LiveServiceCardBase);

const styles = StyleSheet.create({
  card: {
    // `rounded-3xl bg-white ring-1 ring-slate-200/70`
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    padding: spacing.base,
  },
  iconChip: {
    width: 48,
    height: 48,
    borderRadius: radius.medium,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconImage: { width: 48, height: 48 },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: { flexShrink: 1 },
  popular: {
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  blurb: { marginTop: 2 },
  coverage: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
});
