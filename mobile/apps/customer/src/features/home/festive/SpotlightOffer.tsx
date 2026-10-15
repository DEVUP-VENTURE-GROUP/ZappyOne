/**
 * Spotlight scene: the season's offer, big, with confetti falling (the
 * website's SpotlightOffer). Only while its promo code is live.
 */
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { confettiPieces, offerHeadline, offerTerms } from '@zappy/core/shared/season';
import { Text } from '@zappy/ui/components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const Piece = memo(function Piece({ c }: { c: Any }) {
  const fall = useSharedValue(0);
  useEffect(() => { fall.value = withDelay(c.delay, withRepeat(withTiming(1, { duration: c.dur, easing: Easing.bezier(0.3, 0.6, 0.4, 1) }), -1)); }, [c, fall]);
  const style = useAnimatedStyle(() => ({
    opacity: fall.value < 0.1 ? fall.value * 10 : 1 - fall.value,
    transform: [{ translateY: -20 + fall.value * 250 }, { rotate: `${c.rot + fall.value * 540}deg` }],
  }));
  return <Animated.View style={[styles.piece, { left: `${c.x}%`, width: c.w, height: c.h, backgroundColor: c.color }, style]} />;
});

export function SpotlightOffer({ offer, theme }: { offer: Any; theme: Any }) {
  const reduce = useReducedMotion();
  const confetti = useMemo(() => confettiPieces([theme.accent, '#FFFFFF', theme.curtain, '#FBBF24'], 18), [theme]);
  const terms = offerTerms(offer);
  return (
    <View style={styles.wrap}>
      {!reduce ? confetti.map((c: Any, i: number) => <Piece key={i} c={c} />) : null}
      <View style={styles.center}>
        <Animated.View entering={reduce ? undefined : FadeInDown.duration(400)}><Text variant="caption" weight="black" color={theme.accent} style={styles.kicker}>{offer.name.toUpperCase()}</Text></Animated.View>
        <Animated.View entering={reduce ? undefined : ZoomIn.delay(150).springify().damping(10)}><Text weight="black" color={theme.ink} style={styles.big}>{offerHeadline(offer)}</Text></Animated.View>
        {terms ? <Animated.View entering={reduce ? undefined : FadeInDown.delay(350)}><Text variant="caption" color={theme.sub}>{terms}</Text></Animated.View> : null}
        <Animated.View entering={reduce ? undefined : ZoomIn.delay(500).springify()} style={[styles.code, { borderColor: theme.accent }]}>
          <Text variant="bodySmall" weight="black" color={theme.accent} style={styles.codeText}>{offer.code}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  piece: { position: 'absolute', top: 0, borderRadius: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 24 },
  kicker: { letterSpacing: 2.2, textAlign: 'center' },
  big: { fontSize: 46, lineHeight: 50, letterSpacing: -1.5 },
  code: { marginTop: 8, borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.8)' },
  codeText: { letterSpacing: 2 },
});
