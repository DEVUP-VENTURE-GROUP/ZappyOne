import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { Button, Text } from '..';
import { colors, ink, slate, zappy } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

const HOLD_MS = 5000;
const DOTS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  const r = 90 + (i % 3) * 22;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, c: i % 3 === 2 ? '#F59E0B' : i % 2 ? zappy[600] : '#93B4F8', s: 6 + (i % 3) * 2 };
});

function useT(delay: number, duration = 380) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, delay, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [v, delay, duration]);
  return v;
}

function Rise({ delay, children, style }: { delay: number; children: React.ReactNode; style?: object }) {
  const v = useT(delay);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>{children}</Animated.View>;
}

// The few seconds after Confirm (the website's BookedCelebration): the booking is real, what happens next, then tracking opens on its own.
export function BookedCelebration({ title = 'Booking confirmed', lines = [], reference, onDone }: {
  title?: string; lines?: (string | null | undefined)[]; reference?: string; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [reduce, setReduce] = useState(false);
  const done = useRef(false);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };
  const pop = useRef(new Animated.Value(0)).current;
  const tick = useT(350, 300);
  const burst = useT(500, 1100);
  const ring = useT(450, 1400);
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    Animated.timing(bar, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start();
    const t = setTimeout(finish, HOLD_MS);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const steps: [string, boolean][] = [['Booking placed', true], ['Finding the nearest pro', false], ['You will get their name and start code here', false]];

  return (
    <Modal visible animationType="fade" onRequestClose={finish}>
      <View style={[styles.page, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
        <View style={styles.center}>
          <View style={styles.mark}>
            {!reduce ? (
              <Animated.View style={[styles.ring, { opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.1] }) }] }]} />
            ) : null}
            {!reduce ? DOTS.map((d, i) => (
              <Animated.View key={i} style={[styles.dot, {
                width: d.s, height: d.s, borderRadius: d.s / 2, backgroundColor: d.c,
                opacity: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
                transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, d.x] }) }, { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, d.y] }) }],
              }]} />
            )) : null}
            <Animated.View style={[styles.circle, { transform: [{ scale: pop }] }]}>
              <Animated.View style={{ opacity: tick, transform: [{ scale: tick.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
                <Check size={56} color="#fff" strokeWidth={3.2} />
              </Animated.View>
            </Animated.View>
          </View>

          <Rise delay={800} style={styles.gapTop}><Text variant="heading1" weight="extrabold" style={styles.text}>{title}</Text></Rise>
          {lines.filter(Boolean).map((l, i) => (
            <Rise key={String(l)} delay={950 + i * 100}><Text variant="body" color={ink[500]} style={styles.text}>{l}</Text></Rise>
          ))}
          {reference ? <Rise delay={1200}><View style={styles.ref}><Text variant="bodySmall" weight="semibold" color={ink[700]}>Booking ID {reference}</Text></View></Rise> : null}

          <View style={styles.steps}>
            {steps.map(([label, ticked], i) => (
              <Rise key={label} delay={1500 + i * 550} style={styles.step}>
                <View style={[styles.stepIcon, { backgroundColor: ticked ? '#16A34A' : zappy[50] }]}>
                  {ticked ? <Check size={15} color="#fff" strokeWidth={3} /> : i === 1 ? <ActivityIndicator size="small" color={zappy[700]} /> : <View style={styles.pip} />}
                </View>
                <Text variant="body" style={styles.flex}>{label}</Text>
              </Rise>
            ))}
          </View>
        </View>

        <View style={styles.bottom}>
          <Button label="Track my booking" size="large" onPress={finish} fullWidth />
          <View style={styles.track}><Animated.View style={[styles.fill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} /></View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  mark: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 2, borderColor: zappy[600] },
  dot: { position: 'absolute' },
  circle: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[600] },
  gapTop: { marginTop: spacing.xxl },
  text: { textAlign: 'center' },
  ref: { marginTop: spacing.md, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: slate[100] },
  steps: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.xxl, paddingHorizontal: spacing.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: zappy[700] },
  flex: { flex: 1 },
  bottom: { gap: spacing.md, paddingHorizontal: spacing.xl },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: slate[100] },
  fill: { height: '100%', backgroundColor: zappy[600] },
});
