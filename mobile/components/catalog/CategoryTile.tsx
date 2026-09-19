/**
 * CategoryTile — one coverage heading in a service's carousel.
 * ----------------------------------------------------------------------------
 * A port of `CategoryTile` in `client/src/components/home/LiveServices.jsx`.
 * These are the headings under a service — Display, Battery & Power, Storage,
 * Connectivity — with the number of symptoms filed under each.
 *
 * ── WIDTH IS FIXED, IN POINTS ──────────────────────────────────────────────
 * 116pt, exported as `CATEGORY_TILE_WIDTH` so the rail and the tile cannot
 * disagree. The web learned this the hard way: a percentage width inside an
 * overflow row collapsed every tile to ~55px. `HScrollRail` additionally wraps
 * each cell at this width, so the constraint holds even if a caller forgets.
 *
 * ── SENTENCE CASE, DELIBERATELY ────────────────────────────────────────────
 * No `textTransform: 'uppercase'` here, and none should be added. These names
 * come from the admin-managed problem catalog, so the component has to fit
 * whatever an operator types — and uppercase with letter-spacing runs roughly
 * 30% wider, which is what turned "Battery & Power" into a clipped "BAT & POW"
 * on the web. The layout is built around the longest real name, not the
 * shortest.
 *
 * The text block is a FIXED 52pt so one-line and two-line names keep their
 * counts on the same baseline across the row.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  ArrowUpCircle, Battery, Camera, CircuitBoard, Database, Droplet, Gauge,
  HardDrive, Keyboard, Monitor, Plug, ShieldAlert, Sparkles, Thermometer,
  Volume2, Wand2, Wifi, Wrench,
} from 'lucide-react-native';
import { Gradient } from '../ui/Gradient';
import { ScalePressable } from '../ui/Pressable';
import { Text } from '../ui/Text';
import { colors, indigo, violet } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

/** The rail sizes its cells from this. Never a percentage. */
export const CATEGORY_TILE_WIDTH = 116;

/** `aspect-[5/4]` on a 116pt tile. */
const ART_HEIGHT = Math.round((CATEGORY_TILE_WIDTH * 4) / 5);

/** `h-[52px]` — keeps every tile in the row the same height. */
const TEXT_HEIGHT = 52;

/** `from-indigo-50 to-violet-50`. */
const ART_GRADIENT = [indigo[50], violet[50]] as const;

/**
 * Fallback artwork for a heading with no picture set yet, keyed by the
 * catalog's own category codes — mirrors `CATEGORY_ICONS` on the website so a
 * heading looks deliberate on day one and an operator can replace it with a
 * photo whenever they like.
 */
const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  display: Monitor,
  battery_power: Battery,
  charging: Plug,
  keyboard_touchpad: Keyboard,
  body_hinge: Wrench,
  audio: Volume2,
  camera: Camera,
  storage: HardDrive,
  performance: Gauge,
  software: Wand2,
  connectivity: Wifi,
  overheating: Thermometer,
  advanced_hardware: CircuitBoard,
  liquid_damage: Droplet,
  liquid_advanced: Droplet,
  physical: ShieldAlert,
  data_recovery: Database,
  upgrade: ArrowUpCircle,
  maintenance: Sparkles,
};

export interface CategoryTileProps {
  /** Heading name, exactly as the catalog stores it. */
  name: string;
  /** Catalog code — picks the fallback icon. */
  code?: string;
  /** Number of symptoms under this heading. Omitted renders no count line. */
  count?: number;
  /** Admin-uploaded artwork. Falls back to the icon when absent. */
  imageUrl?: string | null;
  onPress?: () => void;
  testID?: string;
}

function CategoryTileBase({
  name,
  code,
  count,
  imageUrl,
  onPress,
  testID,
}: CategoryTileProps) {
  const Icon = (code && CATEGORY_ICONS[code]) || Wrench;
  const hasImage = !!imageUrl;

  const body = (
    <View style={styles.tile}>
      <View style={styles.art}>
        {hasImage ? (
          <Image
            source={{ uri: imageUrl! }}
            style={styles.image}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Gradient colors={ART_GRADIENT} style={styles.artFill}>
            <View style={styles.artCenter}>
              <Icon size={24} strokeWidth={1.6} color={indigo[500]} />
            </View>
          </Gradient>
        )}
      </View>

      <View style={styles.text}>
        <Text
          variant="chip"
          weight="bold"
          color={colors.textHeading}
          numberOfLines={2}
          style={styles.name}
        >
          {name}
        </Text>
        {typeof count === 'number' ? (
          <Text variant="navLabel" weight="medium" color={colors.textMuted}>
            {count} {count === 1 ? 'issue' : 'issues'}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return <View testID={testID}>{body}</View>;

  return (
    <ScalePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        typeof count === 'number'
          ? `${name}, ${count} ${count === 1 ? 'issue' : 'issues'}`
          : name
      }
      testID={testID}
    >
      {body}
    </ScalePressable>
  );
}

export const CategoryTile = memo(CategoryTileBase);

const styles = StyleSheet.create({
  tile: {
    width: CATEGORY_TILE_WIDTH,
    // `rounded-2xl` + `ring-1 ring-slate-200/80`, on the token scale.
    borderRadius: radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  art: {
    width: '100%',
    height: ART_HEIGHT,
  },
  artFill: {
    width: '100%',
    height: ART_HEIGHT,
  },
  artCenter: {
    width: '100%',
    height: ART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: ART_HEIGHT,
  },
  text: {
    height: TEXT_HEIGHT,
    // `px-2.5 pt-2 pb-2`, with the count pinned to the bottom.
    paddingHorizontal: 10,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    justifyContent: 'space-between',
  },
  name: {
    // `leading-[1.25] tracking-[-0.01em]` at 12px.
    lineHeight: 15,
    letterSpacing: -0.12,
  },
});
