// Apple's Liquid Glass (iOS 26+) for controls that float over content; everywhere else it renders the solid fallbackStyle.
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

export const LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

// Where Liquid Glass is not available (Android, older iOS): a white, softly lifted surface that reads like the glass
// one, for controls that float over content (the tab bar, the floating header). Opaque, so Android's elevation shadow
// never shows through it.
export const FROSTED: ViewStyle = {
  backgroundColor: '#FFFFFF',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(15,23,42,0.08)',
  shadowColor: '#0F172A',
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
};

export interface GlassSurfaceProps extends ViewProps {
  fallbackStyle?: StyleProp<ViewStyle>;
  tint?: string;
  interactive?: boolean;
  variant?: 'regular' | 'clear' | 'none';
  // Never fade a glass view with opacity: at 0 it stops rendering; animate the material instead.
  animate?: boolean;
}

export function GlassSurface({ style, fallbackStyle, tint, interactive = false, variant = 'regular', animate = false, children, ...rest }: GlassSurfaceProps) {
  if (!LIQUID_GLASS) return <View style={[style, fallbackStyle]} {...rest}>{children}</View>;
  return (
    <GlassView style={style} glassEffectStyle={animate ? { style: variant, animate: true, animationDuration: 0.25 } : variant}
      tintColor={tint} isInteractive={interactive} colorScheme="light" {...rest}>
      {children}
    </GlassView>
  );
}
