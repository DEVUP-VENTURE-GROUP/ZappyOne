/**
 * Typography primitives.
 * ----------------------------------------------------------------------------
 * All text in the app goes through these so Poppins and the website's type
 * scale are applied consistently. A raw `<Text>` from react-native falls back
 * to the system face and breaks brand parity.
 *
 * Design-system components use StyleSheet + tokens rather than NativeWind
 * classes: it is type-checked, and it avoids per-render class parsing in list
 * rows, which matters on mid-range Android.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import {
  Text as RNText,
  StyleSheet,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { typography, type TypographyVariant } from '../../theme/typography';
import { colors } from '../../theme/colors';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  /** Convenience for the common "make this line bolder" case. */
  weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
  children?: React.ReactNode;
}

const weightFamily = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semibold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
  extrabold: 'Poppins-ExtraBold',
} as const;

function TextBase({
  variant = 'body',
  color,
  align,
  weight,
  style,
  children,
  ...rest
}: TextProps) {
  return (
    <RNText
      style={[
        typography[variant] as TextStyle,
        weight ? { fontFamily: weightFamily[weight] } : null,
        color ? { color } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
      // Cap scaling rather than disabling it: large-text users are supported,
      // but a 2× scale would break card layouts entirely.
      maxFontSizeMultiplier={1.4}
      {...rest}
    >
      {children}
    </RNText>
  );
}

export const Text = memo(TextBase);

export interface HeadingProps extends Omit<TextProps, 'variant'> {
  /** 1 = screen title, 2 = section, 3 = card. `display` for the hero. */
  level?: 1 | 2 | 3 | 'display';
}

function HeadingBase({ level = 2, children, ...rest }: HeadingProps) {
  const variant: TypographyVariant =
    level === 'display'
      ? 'display'
      : level === 1
        ? 'heading1'
        : level === 2
          ? 'heading2'
          : 'heading3';

  return (
    <Text variant={variant} accessibilityRole="header" {...rest}>
      {children}
    </Text>
  );
}

export const Heading = memo(HeadingBase);

/** `.section-title` — the small uppercase label above a group of content. */
function SectionTitleBase({ children, style, ...rest }: TextProps) {
  return (
    <Text variant="sectionTitle" style={[styles.sectionTitle, style]} {...rest}>
      {children}
    </Text>
  );
}

export const SectionTitle = memo(SectionTitleBase);

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.textMuted,
  },
});
