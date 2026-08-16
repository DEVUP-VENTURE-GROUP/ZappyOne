/**
 * Button.
 * ----------------------------------------------------------------------------
 * Ports the website's `.btn-*` classes: 14px radius, 15px bold label, the
 * blue glow shadow on primary, and `active:scale-[0.96]`.
 *
 * Variants map 1:1 to the web: primary · success · outline · secondary · danger
 * plus `ghost` for low-emphasis inline actions.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { ScalePressable } from './Pressable';
import { Text } from './Text';
import { colors, zappy, slate, success as successRamp, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { sizes } from '../../theme/dimensions';
import { spacing } from '../../theme/spacing';

export type ButtonVariant =
  | 'primary'
  | 'success'
  | 'outline'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'dangerGhost';

export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Rendered before the label. Pass a Lucide icon element. */
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

interface VariantStyle {
  container: ViewStyle;
  labelColor: string;
  spinnerColor: string;
  shadow?: ViewStyle;
}

const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: {
    container: { backgroundColor: zappy[600] },
    labelColor: colors.textInverse,
    spinnerColor: colors.textInverse,
    shadow: shadows.glowBlue,
  },
  success: {
    container: { backgroundColor: successRamp[500] },
    labelColor: colors.textInverse,
    spinnerColor: colors.textInverse,
    shadow: shadows.soft,
  },
  outline: {
    container: {
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: zappy[100],
    },
    labelColor: zappy[700],
    spinnerColor: zappy[700],
    shadow: shadows.card,
  },
  secondary: {
    container: { backgroundColor: slate[100] },
    labelColor: slate[700],
    spinnerColor: slate[700],
  },
  danger: {
    container: { backgroundColor: danger[500] },
    labelColor: colors.textInverse,
    spinnerColor: colors.textInverse,
    shadow: shadows.soft,
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    labelColor: zappy[600],
    spinnerColor: zappy[600],
  },
  /**
   * A destructive action that shouldn't shout. `ghost` forces the brand blue,
   * which made "Cancel booking" read as a primary link with a stray red icon —
   * the label and the icon were saying different things.
   */
  dangerGhost: {
    container: { backgroundColor: 'transparent' },
    labelColor: danger[500],
    spinnerColor: danger[500],
  },
};

const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number }> = {
  small: { height: sizes.buttonHeightSmall, paddingHorizontal: spacing.base },
  medium: { height: sizes.buttonHeight, paddingHorizontal: spacing.lg },
  large: { height: 56, paddingHorizontal: spacing.xl },
};

function ButtonBase({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const isInactive = disabled || loading;

  return (
    <ScalePressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      testID={testID}
      style={[
        styles.base,
        v.container,
        v.shadow,
        { height: s.height, paddingHorizontal: s.paddingHorizontal },
        fullWidth && styles.fullWidth,
        // Dim rather than restyle, so the button keeps its identity while
        // clearly reading as unavailable.
        isInactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.spinnerColor} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text
            variant={size === 'small' ? 'buttonSmall' : 'button'}
            color={v.labelColor}
            numberOfLines={1}
          >
            {label}
          </Text>
          {iconRight ? <View style={styles.icon}>{iconRight}</View> : null}
        </View>
      )}
    </ScalePressable>
  );
}

export const Button = memo(ButtonBase);

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: {
    width: '100%',
  },
  inactive: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
