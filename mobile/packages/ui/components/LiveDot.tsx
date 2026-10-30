import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

// A status dot that breathes while something is live; still when off or when the phone asks for less motion.
export function LiveDot({ live, color, offColor, size = 8 }: { live: boolean; color: string; offColor: string; size?: number }) {
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live) { ring.setValue(0); return undefined; }
    let loop: Animated.CompositeAnimation | null = null;
    let gone = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || gone) return;
      loop = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
      loop.start();
    }).catch(() => {});
    return () => { gone = true; loop?.stop(); };
  }, [live, ring]);
  const dot = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[dot, styles.wrap]}>
      {live ? <Animated.View style={[StyleSheet.absoluteFill, dot, { backgroundColor: color, opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }]} /> : null}
      <View style={[dot, { backgroundColor: live ? color : offColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', justifyContent: 'center' } });
