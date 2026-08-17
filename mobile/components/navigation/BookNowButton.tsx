/**
 * Book Now — the raised centre button.
 * ----------------------------------------------------------------------------
 * A gradient disc that overflows above the bar, ringed in the bar's own white
 * so it reads as sitting in front of it rather than punched through it.
 *
 * ── THE 3D ─────────────────────────────────────────────────────────────────
 * The mark turns on its Y axis with a `perspective` in the transform, which is
 * what makes it read as a solid object rotating rather than a flat image being
 * squashed horizontally. Without perspective a rotateY is just a scaleX and
 * looks broken.
 *
 * Idle is a slow ±16° sway, not a full spin: a continuously spinning logo in a
 * tab bar is a distraction the user cannot dismiss, and this one is on screen
 * on every single tab. Pressing it does the full 360° — the rotation belongs
 * to the interaction, and the idle motion is only there to suggest the thing
 * is solid.
 *
 * `useReducedMotion` stops all of it and parks the mark face-on. An
 * indefinitely repeating animation is exactly what that setting exists for.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gradient, Text, ZappyLogo } from '../ui';
import { colors, navy, zappy } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { springSnap } from '../../theme/animation';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface BookNowButtonProps {
  label?: string;
  focused?: boolean;
  /** The bar's own height. The button matches it so the disc can be offset
   *  from the bar's TOP edge rather than from a self-sized container. */
  barHeight: number;
  onPress: () => void;
}

/** Disc diameter. Sized so roughly its top third clears the bar. */
const SIZE = 58;
/** White ring separating the disc from the bar behind it. */
const RING = 4;

function BookNowButtonBase({ label = 'Book Now', barHeight, onPress }: BookNowButtonProps) {
  const reducedMotion = useReducedMotion();

  /** Degrees of Y rotation. Driven by both the idle sway and the press spin. */
  const spin = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      spin.value = 0;
      return;
    }
    // Slow sway either side of face-on. Long enough to feel like breathing.
    spin.value = withRepeat(
      withSequence(
        withTiming(16, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        withTiming(-16, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(spin);
  }, [spin, reducedMotion]);

  const handlePress = useCallback(() => {
    if (!reducedMotion) {
      // One full turn, then hand the axis back to the idle sway.
      cancelAnimation(spin);
      spin.value = 0;
      spin.value = withTiming(360, { duration: 620, easing: Easing.out(Easing.cubic) }, () => {
        spin.value = 0;
      });
    }
    onPress();
  }, [onPress, reducedMotion, spin]);

  const markStyle = useAnimatedStyle(() => ({
    transform: [
      // Perspective FIRST — without it rotateY degenerates into a scaleX.
      { perspective: 420 },
      { rotateY: `${spin.value}deg` },
    ],
  }));

  const discStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.92, springSnap);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springSnap);
      }}
      style={[styles.root, { height: barHeight }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Browse services and start a booking"
    >
      <Animated.View style={[styles.discWrap, discStyle]}>
        <Gradient colors={[zappy[600], navy[900]]} borderRadius={SIZE / 2} style={styles.disc}>
          <Animated.View style={markStyle}>
            <ZappyLogo size={30} />
          </Animated.View>
        </Gradient>
      </Animated.View>

      <View style={styles.labelWrap}>
        <Text variant="navLabel" color={zappy[600]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export const BookNowButton = memo(BookNowButtonBase);

/** How far the disc rises above the bar. Consumed by the tab bar for padding. */
export const BOOK_NOW_LIFT = 22;

const styles = StyleSheet.create({
  // Height comes from the bar so `top: -LIFT` measures from the bar's top edge.
  root: { alignItems: 'center', justifyContent: 'flex-end', width: 78 },

  discWrap: {
    position: 'absolute',
    top: -BOOK_NOW_LIFT,
    width: SIZE + RING * 2,
    height: SIZE + RING * 2,
    borderRadius: (SIZE + RING * 2) / 2,
    // The ring is the bar's own surface, which is what makes the disc read as
    // in front of the bar rather than cut into it.
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Lines the label up with the other tab labels rather than the disc.
  labelWrap: { marginBottom: 10 },
});
