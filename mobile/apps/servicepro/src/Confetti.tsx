// A confetti burst in ZappyOne colours, drawn on the GPU with Skia: each piece falls, drifts and spins once; skipped when the phone asks for less motion.
import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { Canvas, Group, RoundedRect } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { zappyNative } from '@zappy/native';

const COLORS = ['#1F4FD8', '#3463DD', '#F59E0B', '#FBBF24', '#22C55E'];
type Piece = { x: number; y0: number; w: number; h: number; color: string; speed: number; wobble: number; spin: number };

function Bit({ p, progress, fall }: { p: Piece; progress: SharedValue<number>; fall: number }) {
  const transform = useDerivedValue(() => {
    const t = progress.value;
    return [{ translateX: p.x + Math.sin(t * p.wobble) * 18 }, { translateY: p.y0 + t * fall * p.speed }, { rotate: t * p.spin }];
  });
  return <Group transform={transform}><RoundedRect x={-p.w / 2} y={-p.h / 2} width={p.w} height={p.h} r={2} color={p.color} /></Group>;
}

export function Confetti({ count: wanted = 70 }: { count?: number }) {
  // Lighter on phones short on memory, so the celebration never stutters there.
  const count = zappyNative.isLowRam() ? Math.min(wanted, 18) : wanted;
  const { width, height } = Dimensions.get('window');
  const progress = useSharedValue(0);
  const [still, setStill] = useState(true);
  const pieces = useMemo<Piece[]>(() => Array.from({ length: count }, () => ({
    x: Math.random() * width, y0: -40 - Math.random() * height * 0.4, w: 6 + Math.random() * 6, h: 10 + Math.random() * 8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)], speed: 0.7 + Math.random() * 0.6, wobble: 4 + Math.random() * 8, spin: (Math.random() - 0.5) * 12,
  })), [count, width, height]);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      setStill(false);
      progress.value = withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) });
    }).catch(() => {});
  }, [progress]);
  if (still) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => <Bit key={i} p={p} progress={progress} fall={height + 120} />)}
    </Canvas>
  );
}
