// Apple's Liquid Glass (iOS 26+) for controls that float over content; everywhere else it renders the solid fallbackStyle.
import { Platform, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

export const LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

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
