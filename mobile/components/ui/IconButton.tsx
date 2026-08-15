/**
 * Icon button — the website's `.btn-icon`: a 44×44 rounded square.
 * 44pt is the WCAG 2.5.5 / Apple HIG minimum, and the web file notes it was
 * deliberately raised from 40 to meet it. Keep it at 44.
 */

import React, { memo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { ScalePressable } from './Pressable';
import { colors, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { sizes } from '../../theme/dimensions';

export type IconButtonVariant = 'plain' | 'surface' | 'primary' | 'ghost';

export interface IconButtonProps {
  /** Lucide icon element. */
  icon: React.ReactNode;
  onPress?: () => void;
  variant?: IconButtonVariant;
  disabled?: boolean;
  /** Required — an icon-only control is invisible to a screen reader without it. */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANT_STYLE: Record<IconButtonVariant, ViewStyle> = {
  plain: { backgroundColor: 'transparent' },
  surface: { backgroundColor: slate[100] },
  primary: { backgroundColor: colors.primary },
  ghost: { backgroundColor: 'rgba(255,255,255,0.9)' },
};

function IconButtonBase({
  icon,
  onPress,
  variant = 'surface',
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: IconButtonProps) {
  return (
    <ScalePressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      testID={testID}
      style={[styles.base, VARIANT_STYLE[variant], disabled && styles.disabled, style]}
    >
      {icon}
    </ScalePressable>
  );
}

export const IconButton = memo(IconButtonBase);

const styles = StyleSheet.create({
  base: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
