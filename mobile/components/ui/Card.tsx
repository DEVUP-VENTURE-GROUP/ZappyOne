/**
 * Card.
 * ----------------------------------------------------------------------------
 * The website's `.card`: 24px radius, white surface, soft shadow, a 1px
 * slate ring, 20px padding. `elevated` and `hero` map to `.card-elevated` and
 * `.card-hero` (the blue→navy gradient).
 *
 * Passing `onPress` turns it into a pressable that scales on touch, matching
 * `button.card:active { scale-[0.99] }` on the web.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gradient } from './Gradient';
import { ScalePressable } from './Pressable';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { pressScale } from '../../theme/animation';

export type CardVariant = 'default' | 'elevated' | 'flat' | 'hero' | 'outline';

export interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

function CardBase({
  children,
  variant = 'default',
  onPress,
  padding,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: CardProps) {
  const variantStyle: StyleProp<ViewStyle> =
    variant === 'elevated'
      ? [styles.surface, shadows.softLarge]
      : variant === 'flat'
        ? [styles.surface, styles.flat]
        : variant === 'outline'
          ? [styles.surface, styles.outline]
          : [styles.surface, shadows.soft];

  const content = (
    <View style={[styles.inner, padding != null && { padding }]}>{children}</View>
  );

  if (variant === 'hero') {
    const gradient = (
      <Gradient
        borderRadius={radius.medium}
        style={[shadows.softLarge, !onPress && style]}
        testID={testID}
      >
        {content}
      </Gradient>
    );

    if (!onPress) return gradient;
    return (
      <ScalePressable
        onPress={onPress}
        scaleTo={pressScale.card}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={style}
      >
        {gradient}
      </ScalePressable>
    );
  }

  if (!onPress) {
    return (
      <View style={[styles.base, variantStyle, style]} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <ScalePressable
      onPress={onPress}
      scaleTo={pressScale.card}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={[styles.base, variantStyle, style]}
    >
      {content}
    </ScalePressable>
  );
}

export const Card = memo(CardBase);

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.large,
    overflow: 'hidden',
  },
  surface: {
    backgroundColor: colors.surface,
    // The website's `ring-1 ring-slate-900/5`. A hairline border is far
    // cheaper than a shadow and is what keeps list rows fast on Android.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  flat: {
    borderWidth: 0,
    backgroundColor: colors.surfaceSecondary,
  },
  outline: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  inner: {
    padding: spacing.lg,
  },
});
