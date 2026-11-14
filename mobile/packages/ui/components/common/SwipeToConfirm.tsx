// Slide to confirm a step that must not happen by an accidental tap (like the ride apps' finish trip). Built on core PanResponder and Animated only, so it ships over the air.
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, StyleSheet, Vibration, View, type LayoutChangeEvent } from 'react-native';
import { ChevronsRight } from 'lucide-react-native';
import { Text } from '../Text';
import { zappy, ink, slate } from '../../theme/colors';

const KNOB = 52;
const PAD = 4;
const DONE_AT = 0.85;

export function SwipeToConfirm({ label, onConfirm, disabled = false, loading = false }: {
  label: string; onConfirm: () => unknown; disabled?: boolean; loading?: boolean;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const max = Math.max(0, width - KNOB - PAD * 2);
  const live = useRef({ max, off: disabled || loading, busy: false });
  live.current.max = max;
  live.current.off = disabled || loading;

  const back = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 8, speed: 14 }).start();
  const finish = () => {
    live.current.busy = true;
    Vibration.vibrate(35);
    Animated.timing(x, { toValue: live.current.max, duration: 110, useNativeDriver: true }).start(() => {
      Promise.resolve().then(onConfirm).catch(() => {}).finally(() => { live.current.busy = false; back(); });
    });
  };

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !live.current.off && !live.current.busy && Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => x.setValue(Math.min(Math.max(0, g.dx), live.current.max)),
    onPanResponderRelease: (_, g) => (live.current.max && g.dx >= live.current.max * DONE_AT ? finish() : back()),
    onPanResponderTerminate: back,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const labelOpacity = x.interpolate({ inputRange: [0, Math.max(1, max * 0.6)], outputRange: [1, 0], extrapolate: 'clamp' });
  // A track-wide strip slid in by transform (the native driver cannot animate width): its right edge follows the knob.
  const fillX = x.interpolate({ inputRange: [0, Math.max(1, max)], outputRange: [-max, 0], extrapolate: 'clamp' });
  const off = disabled || loading;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}. Slide right to confirm`}
      accessibilityState={{ disabled: off, busy: loading }}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={() => { if (!off) finish(); }}
      style={[styles.track, off && styles.trackOff]}
    >
      <Animated.View style={[styles.fill, { width, transform: [{ translateX: fillX }] }]} />
      <Animated.View style={[styles.labelBox, { opacity: labelOpacity }]} pointerEvents="none">
        <Text variant="body" weight="bold" color={off ? ink[400] : zappy[700]}>{label}</Text>
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={[styles.knob, off && styles.knobOff, { transform: [{ translateX: x }] }]}>
        {loading ? <ActivityIndicator color="#fff" /> : <ChevronsRight size={24} color="#fff" strokeWidth={2.6} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: KNOB + PAD * 2, borderRadius: 999, backgroundColor: zappy[50], borderWidth: 1, borderColor: zappy[100], justifyContent: 'center', overflow: 'hidden' },
  trackOff: { backgroundColor: slate[100], borderColor: slate[200] },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: zappy[100] },
  labelBox: { position: 'absolute', left: KNOB + PAD * 2, right: PAD * 2, alignItems: 'center' },
  knob: { position: 'absolute', left: PAD, width: KNOB, height: KNOB, borderRadius: 999, backgroundColor: zappy[600], alignItems: 'center', justifyContent: 'center', elevation: 3 },
  knobOff: { backgroundColor: ink[300], elevation: 0 },
});
