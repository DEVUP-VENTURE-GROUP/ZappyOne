// The moment a job is completed: a tick that lands, what the pro earned, the customer rating, and where to go next.
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, ScrollView, StyleSheet, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { useJobEarningsQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '../../components';
import { RateCustomerCard } from '../../components/worker/RateCustomerCard';
import { Celebration } from '../../components/common/celebrationSlot';
import { colors, ink, success } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

export function JobDoneScreen({ jobId, reference, onHome, onNext }: { jobId: string; reference?: string; onHome: () => void; onNext: () => void }) {
  const insets = useSafeAreaInsets();
  const { data } = useJobEarningsQuery(jobId);
  const earned = data?.earnings?.youEarnPaise as number | undefined;
  const pop = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Vibration.vibrate([0, 40, 60, 40]);
    AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (still) { pop.setValue(1); rise.setValue(1); return; }
      Animated.sequence([
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        Animated.timing(rise, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }).catch(() => { pop.setValue(1); rise.setValue(1); });
  }, [pop, rise]);
  const up = { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] };
  return (
    <Modal visible animationType="fade" onRequestClose={onHome}>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg }]}>
        <Animated.View style={[styles.tick, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }], opacity: pop }]}>
          <Check size={48} color="#FFFFFF" strokeWidth={3} />
        </Animated.View>
        <Animated.View style={[styles.center, up]}>
          <Text variant="heading2" weight="black">Job done</Text>
          {reference ? <Text variant="bodySmall" color={ink[500]}>Booking {reference}</Text> : null}
          {earned != null ? <Text variant="heading3" weight="extrabold" color={success[700]}>You earned {formatPaise(earned)}</Text> : null}
        </Animated.View>
        <Animated.View style={[styles.full, up]}>
          <RateCustomerCard jobId={jobId} rated={false} />
        </Animated.View>
        <View style={styles.actions}>
          <Button label="See my next jobs" onPress={onNext} fullWidth size="large" />
          <Button label="Back to Home" variant="outline" onPress={onHome} fullWidth />
        </View>
      </ScrollView>
      <Celebration />
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.base, backgroundColor: colors.background },
  tick: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: success[600] },
  center: { alignItems: 'center', gap: spacing.xs },
  full: { alignSelf: 'stretch' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: 'auto' },
});
