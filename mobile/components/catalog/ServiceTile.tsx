/**
 * The service tile — one component, three shapes.
 * ----------------------------------------------------------------------------
 * Ported from `client/src/components/catalog/ServiceTile.jsx`, which describes
 * itself as "deliberately minimal: a spotlit illustration and the service name,
 * nothing else… The tile's whole job is to be recognised at a glance and
 * tapped; the detail page carries the commercial detail and the booking CTA."
 * That is exactly the flow on mobile too, so the same rule applies here.
 *
 * VARIANTS
 *   rail   — the horizontal Home rails. Fixed width, tinted art box.
 *   large  — mosaic lead tile: spans two grid columns, 84px art, shows price.
 *   small  — mosaic filler tile: one column, 50px art, no price.
 *
 * The two mosaic sizes drive the website's bento rhythm on the category page:
 * the first few services lead as double-width tiles and the rest fill in as
 * quarter-width ones. `large`/`small` here match its `h-[188px] p-3` and
 * `h-[136px] p-2`, its `rounded-[20px]` border and 1px shadow, and its warm
 * amber downlight — which is CSS on the web for the same reason it is a
 * gradient here: at tile scale the illustration's own spotlight is too tight
 * to read.
 *
 * Kept as ONE component rather than a second card system: the rail variant is
 * the tile Home already used, moved here so the category grid can share it.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Zap } from 'lucide-react-native';
import { Gradient, ScalePressable, Text, formatRupees } from '../ui';
import { ServiceIllustration } from './ServiceIllustration';
import { illustrationFor } from './illustrations/resolve';
import { paiseToRupees } from './categoryIcons';
import { colors, accent as accentRamp, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { fontFamily } from '../../theme/typography';
import type { ServiceCatalogItem } from '../../types/api';

export type ServiceTileVariant = 'rail' | 'large' | 'small';

export interface ServiceTileProps {
  service: ServiceCatalogItem;
  variant?: ServiceTileVariant;
  /** Category accent, used for the "Popular" flag and press ring. */
  accent?: string;
  onPress: (service: ServiceCatalogItem) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The website's downlight:
 *   radial-gradient(72% 58% at 50% -4%, rgba(245,158,11,.20), …07 42%, …0 72%)
 *
 * Rendered with the app's existing SVG `Gradient` rather than pulling in a
 * gradient package: it is a vertical two-stop, which is the closest this
 * project's primitive gets and is indistinguishable at tile scale.
 */
const SPOTLIGHT = ['rgba(245,158,11,0.13)', 'rgba(245,158,11,0)'] as const;

function ServiceTileBase({
  service,
  variant = 'rail',
  accent = zappy[600],
  onPress,
  style,
}: ServiceTileProps) {
  const drawing = illustrationFor(service, service.category);
  const price = paiseToRupees(service.servicePricePaise || service.priceRangeMinPaise);

  // ── Home rail ─────────────────────────────────────────────────────────────
  if (variant === 'rail') {
    return (
      <ScalePressable
        style={[styles.rail, style]}
        onPress={() => onPress(service)}
        accessibilityRole="button"
        accessibilityLabel={`${service.name}${price > 0 ? `, from ${formatRupees(price)}` : ''}`}
      >
        <View style={styles.railArt}>
          <ServiceIllustration name={drawing} size={40} categoryKey={service.category} />
        </View>
        <Text variant="bodySmall" weight="semibold" numberOfLines={2}>
          {service.name}
        </Text>
        {price > 0 ? (
          <Text variant="caption" weight="semibold" color={colors.primary}>
            From {formatRupees(price)}
          </Text>
        ) : null}
      </ScalePressable>
    );
  }

  // ── Mosaic ────────────────────────────────────────────────────────────────
  const large = variant === 'large';

  return (
    <ScalePressable
      style={[styles.mosaic, large ? styles.mosaicLarge : styles.mosaicSmall, style]}
      scaleTo={0.97}
      onPress={() => onPress(service)}
      accessibilityRole="button"
      accessibilityLabel={`${service.name}${
        large && price > 0 ? `, from ${formatRupees(price)}` : ''
      }`}
    >
      <Gradient colors={SPOTLIGHT} style={styles.spotlight} />

      {/* The website flags a featured service in the top-left corner. */}
      {service.isFeatured ? (
        <View style={styles.flag}>
          <Zap size={8} strokeWidth={3.5} color={accentRamp[700]} />
          <Text style={styles.flagText}>Popular</Text>
        </View>
      ) : null}

      <View style={styles.mosaicArt}>
        <ServiceIllustration
          name={drawing}
          size={large ? 84 : 50}
          categoryKey={service.category}
          spotlight={false}
        />
      </View>

      <View style={styles.mosaicFoot}>
        <Text
          style={[styles.mosaicName, large ? styles.mosaicNameLarge : styles.mosaicNameSmall]}
          numberOfLines={3}
        >
          {service.name}
        </Text>
        {/* Only the lead tiles carry a price, exactly as on the web. */}
        {large && price > 0 ? (
          <Text style={styles.mosaicPrice}>from {formatRupees(price)}</Text>
        ) : null}
      </View>
    </ScalePressable>
  );
}

export const ServiceTile = memo(ServiceTileBase);

const styles = StyleSheet.create({
  // ── rail ──
  rail: { width: 108, gap: spacing.sm },
  railArt: {
    width: 108,
    height: 108,
    borderRadius: radius.large,
    backgroundColor: zappy[50],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // ── mosaic ── `rounded-[20px] border border-slate-200/70 bg-white
  //              shadow-[0_1px_2px_rgba(15,23,42,0.04)]`
  mosaic: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    overflow: 'hidden',
  },
  mosaicLarge: { height: 188, padding: spacing.md },
  mosaicSmall: { height: 136, padding: spacing.sm },

  // The web cone is radial and concentrated at top-centre; a linear wash of
  // the same strength spreads far wider, so this is shorter and lighter to
  // land at the same visual weight.
  spotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: '52%' },

  mosaicArt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mosaicFoot: { width: '100%', alignItems: 'center' },

  mosaicName: {
    fontFamily: fontFamily.bold,
    color: colors.textHeading,
    textAlign: 'center',
  },
  mosaicNameLarge: { fontSize: 13.5, lineHeight: 17 },
  mosaicNameSmall: { fontSize: 10.5, lineHeight: 13 },
  mosaicPrice: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // `bg-[#FEF3C7] text-[#B45309] text-[9px] font-black uppercase`
  flag: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.pill,
    backgroundColor: accentRamp[100],
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
  },
  flagText: {
    fontFamily: fontFamily.black,
    fontSize: 9,
    lineHeight: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: accentRamp[700],
  },
});
