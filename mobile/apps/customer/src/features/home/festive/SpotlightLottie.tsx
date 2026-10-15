/**
 * Spotlight scene: an animated festival scene (the website's SpotlightLottie):
 * a garba dancer, Durga Maa, a Diwali diya, in its own card with the line
 * beside it. Only used where the build has the player (lottieReady).
 */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function SpotlightLottie({ scene, theme }: { scene: Any; theme: Any }) {
  const reduce = useReducedMotion();
  // Loaded only when this scene shows, which is only where lottieReady() found the player.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const LottieView = require('lottie-react-native').default;
  return (
    <View style={[styles.card, { backgroundColor: theme.tile, borderColor: theme.line, shadowColor: theme.dark ? '#000' : '#7a4a00' }]}>
      <Animated.View entering={reduce ? undefined : ZoomIn.springify().damping(14)} style={[styles.art, { backgroundColor: scene.card }]}>
        <LottieView source={{ uri: webAsset(scene.src) }} autoPlay={!reduce} loop progress={reduce ? 0.6 : undefined} resizeMode="cover" style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.words}>
        <Animated.View entering={reduce ? undefined : FadeInDown.delay(200).duration(450)}>
          <Text variant="caption" weight="black" color={theme.accent} style={styles.kicker}>{String(scene.kicker).toUpperCase()}</Text>
        </Animated.View>
        <Animated.View entering={reduce ? undefined : FadeInDown.delay(350).duration(450)}>
          <Text variant="heading3" weight="black" color={theme.tileInk}>{scene.title}</Text>
        </Animated.View>
        <Animated.View entering={reduce ? undefined : FadeInDown.delay(500).duration(450)} style={[styles.dash, { backgroundColor: theme.accent }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', top: 6, bottom: 6, left: 12, right: 12, flexDirection: 'row', gap: 12, padding: 8,
    borderRadius: 24, borderWidth: 1, overflow: 'hidden', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  art: { height: '100%', aspectRatio: 1, maxWidth: '46%', borderRadius: 18, overflow: 'hidden' },
  words: { flex: 1, minWidth: 0, justifyContent: 'center', paddingRight: 4, gap: 4 },
  kicker: { letterSpacing: 2 },
  dash: { width: 40, height: 3, borderRadius: 2, marginTop: 6 },
});
