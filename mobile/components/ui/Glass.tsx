/**
 * Liquid Glass — Apple's iOS 26 material, for the controls layer only.
 * ----------------------------------------------------------------------------
 * Glass is for things that float over content: the tab bar, header buttons,
 * the search field, segmented switches, filter chips. Content itself (cards,
 * photos, banners) stays solid, as Apple's guidance asks.
 *
 * `LIQUID_GLASS` is true only on iOS 26+ with the glass API present. Android
 * and older iOS get `fallbackStyle` — the solid look the app already had — so
 * every call site reads the same on both platforms.
 *
 * Don't animate `opacity` on a glass view or any ancestor: at 0 the effect
 * stops rendering and does not come back. Fade with `glassEffectStyle`
 * ('none' ↔ 'regular', animated) instead.
 * ----------------------------------------------------------------------------
 */

import React from 'react';
import { Platform, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

export const LIQUID_GLASS =
  Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

export interface GlassSurfaceProps extends ViewProps {
  /** Applied only where glass isn't available — the solid look to fall back to. */
  fallbackStyle?: StyleProp<ViewStyle>;
  /** Tints the glass (e.g. the brand blue for a selected segment). */
  tint?: string;
  /** Native press response (the glass flexes under the finger). */
  interactive?: boolean;
  /** 'clear' is for glass over busy imagery; 'regular' everywhere else. */
  variant?: 'regular' | 'clear' | 'none';
  /** Fade the material in/out without touching opacity. */
  animate?: boolean;
}

export function GlassSurface({
  style, fallbackStyle, tint, interactive = false, variant = 'regular', animate = false, children, ...rest
}: GlassSurfaceProps) {
  if (!LIQUID_GLASS) {
    return <View style={[style, fallbackStyle]} {...rest}>{children}</View>;
  }
  return (
    <GlassView
      style={style}
      glassEffectStyle={animate ? { style: variant, animate: true, animationDuration: 0.25 } : variant}
      tintColor={tint}
      isInteractive={interactive}
      colorScheme="light"
      {...rest}
    >
      {children}
    </GlassView>
  );
}
