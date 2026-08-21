/**
 * Service + category cards for the catalog.
 * ----------------------------------------------------------------------------
 * Ported from the website's `catalog/ServiceCard.jsx` and `CategoryStrip.jsx`:
 *
 *   ServiceCard    icon/illustration · name · description · signal row ·
 *                  hairline divider · "STARTS AT" label + large price ·
 *                  category-accent CTA pill
 *   CategoryCard   148px-equivalent card with a 48px rounded icon tile in the
 *                  category's own theme colour, bold label, accent chevron
 *
 * NOTE ON SIGNALS: the website shows rating and booking counts, but renders
 * them ONLY when the service carries those fields — and `ServiceCatalog` has
 * no rating/bookingsCount, so they are absent on the web too. This card
 * therefore shows only what the catalog genuinely provides:
 * `estimatedDurationMinutes` and the `checklist` length. Nothing is invented.
 *
 * The CTA and icon tint take the CATEGORY's theme colour (`category.theme`),
 * which is what gives each vertical its own identity — the same
 * `--cat-accent` custom property the website drives these from.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ChevronRight, Clock, ListChecks } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { ScalePressable } from '../ui/Pressable';
import { formatRupees } from '../ui/Misc';
import { humanizeCode, paiseToRupees } from './categoryIcons';
import { ServiceIllustration } from './ServiceIllustration';
import { illustrationFor } from './illustrations/resolve';
import { CATEGORY_THEME, DEFAULT_THEME } from './illustrations/palette';
import { colors, zappy, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
import { pressScale } from '../../theme/animation';
import type { ServiceCatalogItem, ServiceCategory } from '../../types/api';

// ── Service card ─────────────────────────────────────────────────────────────

export interface ServiceCardProps {
  service: ServiceCatalogItem;
  /** Category that owns this service — supplies the accent colour. */
  category?: ServiceCategory | null;
  onPress: (service: ServiceCatalogItem) => void;
}

function ServiceCardBase({ service, category, onPress }: ServiceCardProps) {
  // The site draws services with its own illustration set, resolved from the
  // service's own text — not with a glyph. See components/catalog/illustrations.
  const drawing = illustrationFor(service, category?.key);
  const accent = category?.theme?.accent ?? zappy[600];
  const tint = category?.theme?.tint ?? zappy[50];

  const name = service.name || humanizeCode(service.code);
  const description = service.shortDescription || service.description;
  const price = paiseToRupees(service.servicePricePaise || service.priceRangeMinPaise);
  const duration = service.estimatedDurationMinutes;
  const checks = service.checklist?.length ?? 0;
  const artwork = service.imageUrl || service.coverImage;

  return (
    <Card
      onPress={() => onPress(service)}
      padding={spacing.base}
      accessibilityLabel={`${name}${price > 0 ? `, from ${formatRupees(price)}` : ''}`}
      accessibilityHint="Opens service details"
    >
      {/* Identity */}
      <View style={styles.topRow}>
        <View style={[styles.art, { backgroundColor: tint }]}>
          {artwork ? (
            <Image
              source={{ uri: artwork }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <ServiceIllustration
              name={drawing}
              size={42}
              categoryKey={category?.key}
            />
          )}
        </View>

        <View style={styles.identity}>
          <Text variant="heading3" numberOfLines={2}>
            {name}
          </Text>
          {description ? (
            <Text variant="bodySmall" numberOfLines={2} style={styles.description}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Signals — only what the catalog actually provides */}
      {duration || checks > 0 ? (
        <View style={styles.signals}>
          {duration ? (
            <View style={styles.signal}>
              <Clock size={12} strokeWidth={2.6} color={colors.textMuted} />
              <Text variant="caption" weight="semibold" color={colors.textSecondary}>
                {duration} min
              </Text>
            </View>
          ) : null}
          {checks > 0 ? (
            <View style={styles.signal}>
              <ListChecks size={12} strokeWidth={2.6} color={colors.textMuted} />
              <Text variant="caption" weight="semibold" color={colors.textSecondary}>
                {checks} step{checks === 1 ? '' : 's'} included
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Price + CTA, below a hairline rule — matches the website's card foot */}
      <View style={styles.foot}>
        <View style={styles.priceBlock}>
          <Text variant="label" color={colors.textMuted}>
            {price > 0 ? 'Starts at' : 'Pricing'}
          </Text>
          <Text variant="heading2" color={colors.textHeading} numberOfLines={1}>
            {price > 0 ? formatRupees(price) : 'On quote'}
          </Text>
        </View>

        <View style={[styles.cta, { backgroundColor: accent }]}>
          <Text variant="buttonSmall" color={colors.textInverse}>
            Book
          </Text>
        </View>
      </View>
    </Card>
  );
}

export const ServiceCard = memo(ServiceCardBase);

// ── Category card (horizontal rail) ──────────────────────────────────────────

export interface CategoryCardProps {
  category: ServiceCategory;
  selected: boolean;
  count?: number;
  onPress: (category: ServiceCategory) => void;
}

function CategoryCardBase({ category, selected, count, onPress }: CategoryCardProps) {
  // The site's category cards render the category's DEFAULT DRAWING at size 32
  // (`CategoryStrip.jsx`), never a glyph.
  const drawing = CATEGORY_THEME[category.key]?.illustration ?? DEFAULT_THEME.illustration;
  const accent = category.theme?.accent ?? zappy[600];
  const tint = category.theme?.tint ?? zappy[50];

  return (
    <ScalePressable
      onPress={() => onPress(category)}
      scaleTo={pressScale.tile}
      style={[
        styles.categoryCard,
        selected && { borderColor: accent, borderWidth: 1.5, backgroundColor: tint },
      ]}
      accessibilityRole="button"
      accessibilityLabel={category.customerLabel}
      accessibilityState={{ selected }}
    >
      <View
        style={[
          styles.categoryIcon,
          { backgroundColor: selected ? colors.surface : tint },
        ]}
      >
        <ServiceIllustration name={drawing} size={32} categoryKey={category.key} />
      </View>

      <Text
        variant="bodySmall"
        weight="bold"
        color={colors.textHeading}
        numberOfLines={2}
        style={styles.categoryLabel}
      >
        {category.customerLabel}
      </Text>

      <View style={styles.categoryFoot}>
        <Text variant="caption" weight="semibold" color={colors.textMuted}>
          {count != null ? `${count} service${count === 1 ? '' : 's'}` : 'Browse'}
        </Text>
        <ChevronRight size={13} color={accent} />
      </View>
    </ScalePressable>
  );
}

export const CategoryCard = memo(CategoryCardBase);

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', gap: spacing.md },
  art: {
    width: 56,
    height: 56,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  identity: { flex: 1 },
  description: { marginTop: 2 },

  signals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.base,
    marginTop: spacing.md,
  },
  signal: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  foot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  priceBlock: { flex: 1, minWidth: 0 },
  cta: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    // Minimum comfortable target without inflating the card.
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },

  categoryCard: {
    width: 146,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: slate[200],
    padding: spacing.md + 2,
    ...shadows.card,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: { marginTop: spacing.md },
  categoryFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
});
