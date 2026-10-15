/**
 * The season's offer (the website's FestiveOffer): a live promo code, said as
 * it is, with a light passing across it now and then. Tap shows the code to
 * use at checkout (as the offers rail does; no clipboard module in the app).
 * Nothing shows when the promo is not live.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { offerHeadline, offerTerms } from '@zappy/core/shared/season';
import { Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function FestiveOffer({ offer, accent }: { offer: Any; accent: string }) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(-1);
  useEffect(() => {
    if (reduce || !w) return;
    x.value = withRepeat(withSequence(withDelay(1200, withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) })), withTiming(-1, { duration: 0 })), -1);
  }, [reduce, w, x]);
  const sheen = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * w }, { skewX: '-20deg' }] }));

  if (!offer) return null;
  const terms = offerTerms(offer);

  return (
    <Pressable onPress={() => toast(`Use code ${offer.code} at checkout`)} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} accessibilityRole="button"
      accessibilityLabel={`${offerHeadline(offer)}, code ${offer.code}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.amount, { backgroundColor: accent }]}><Text variant="body" weight="black" color="#fff">{offerHeadline(offer)}</Text></View>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="bold" numberOfLines={1}>{offer.name}</Text>
        <Text variant="caption" color={ink[500]} numberOfLines={1}>Code {offer.code}{terms ? ` · ${terms}` : ''}</Text>
      </View>
      <ChevronRight size={18} color={ink[400]} />
      {!reduce && w ? <Animated.View pointerEvents="none" style={[styles.sheen, sheen]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, paddingRight: spacing.md, overflow: 'hidden',
    borderRadius: radius.large, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  amount: { height: 44, paddingHorizontal: 12, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  sheen: { position: 'absolute', top: -10, bottom: -10, width: 60, backgroundColor: 'rgba(255,255,255,0.55)' },
});
