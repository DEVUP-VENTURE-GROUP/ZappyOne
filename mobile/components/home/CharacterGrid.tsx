/**
 * The character service grid.
 * ----------------------------------------------------------------------------
 * Port of the web `CharacterServiceGrid`'s MOBILE branch: four columns of
 * bordered white cards, each a square tinted panel holding the 3D character
 * with a label strip beneath — name, then "From ₹x" (or "View all" on More).
 *
 * The web tile is `rounded-[16px] border-slate-200 shadow-sm` with the tint on
 * the image area only and the strip left white; that split is what stops eight
 * saturated squares from fighting each other, so it is kept.
 *
 * ── THE FLOAT ──────────────────────────────────────────────────────────────
 * Each character drifts 3px and back over 4s, staggered by 150ms per tile — the
 * same numbers the web grid animates with. Staggering matters: eight sprites
 * rising in unison reads as the whole page wobbling, whereas offset phases read
 * as eight separate characters idling. `useReducedMotion` parks them all.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LayoutGrid } from 'lucide-react-native';
import { ScalePressable, Text } from '../ui';
import { CHARACTER_CATEGORIES, type CharacterCategory } from '../../constants/categoryMap';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const COLUMNS = 4;
const GAP = spacing.md;

interface TileProps {
  item: CharacterCategory;
  index: number;
  width: number;
  onPress: (item: CharacterCategory) => void;
}

function Tile({ item, index, width, onPress }: TileProps) {
  const isMore = item.routeKey === null;
  const reducedMotion = useReducedMotion();
  const lift = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      lift.value = 0;
      return;
    }
    lift.value = withDelay(
      index * 150,
      withRepeat(
        withSequence(
          withTiming(-3, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(lift);
  }, [lift, index, reducedMotion]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }],
  }));

  return (
    <ScalePressable
      onPress={() => onPress(item)}
      style={[styles.tile, { width }]}
      accessibilityRole="button"
      accessibilityLabel={
        item.routeKey === null
          ? 'More services, view all'
          : `${item.label}, from ${item.price}`
      }
    >
      <View style={[styles.art, { backgroundColor: item.tint }]}>
        {isMore ? (
          // The web tile swaps the character for a solid blue disc and a grid
          // glyph here — "More" is a way out of the grid, not another service,
          // so it deliberately does not look like its neighbours.
          <View style={styles.moreDisc}>
            <LayoutGrid size={20} strokeWidth={2.25} color={colors.textInverse} />
          </View>
        ) : (
          <Animated.Image
            source={item.thumb}
            style={[styles.character, floatStyle]}
            resizeMode="contain"
          />
        )}
      </View>

      <View style={styles.strip}>
        <Text
          variant="caption"
          weight="bold"
          align="center"
          color={colors.textHeading}
          numberOfLines={1}
          style={styles.label}
        >
          {item.label}
        </Text>
        <Text
          variant="caption"
          align="center"
          color={colors.textSecondary}
          numberOfLines={1}
          style={styles.price}
        >
          {item.routeKey === null ? (
            <Text variant="caption" weight="semibold" color={colors.textHeading}>
              {item.price}
            </Text>
          ) : (
            <>
              From{' '}
              <Text variant="caption" weight="semibold" color={colors.textHeading}>
                {item.price}
              </Text>
            </>
          )}
        </Text>
      </View>
    </ScalePressable>
  );
}

export interface CharacterGridProps {
  onSelect: (item: CharacterCategory) => void;
}

function CharacterGridBase({ onSelect }: CharacterGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  // Four columns inside the page gutter, three gaps between them. Floored so a
  // rounding remainder can never push the fourth tile onto its own row.
  const tileWidth = Math.floor(
    (screenWidth - screenPadding * 2 - GAP * (COLUMNS - 1)) / COLUMNS,
  );

  return (
    <View style={styles.grid}>
      {CHARACTER_CATEGORIES.map((item, index) => (
        <Tile
          key={item.id}
          item={item}
          index={index}
          width={tileWidth}
          onPress={onSelect}
        />
      ))}
    </View>
  );
}

export const CharacterGrid = memo(CharacterGridBase);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },

  tile: {
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  art: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  character: { width: '100%', height: '100%' },
  moreDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  strip: { paddingHorizontal: 2, paddingVertical: spacing.sm },
  // Sized so the longest labels ("Car Service", "Bike Repair") fit on one
  // line at 375pt, where 12px clipped them to "Car Serv…".
  label: { fontSize: 11, lineHeight: 14 },
  price: { fontSize: 10, lineHeight: 13, marginTop: 1 },
});
