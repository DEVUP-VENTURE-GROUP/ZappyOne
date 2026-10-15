/**
 * The festive spotlight (the website's FestiveSpotlight), as Zepto's: a stage
 * at the top of the festive band that changes scene every few seconds, each
 * its own festive animation (curtains opening on the greeting, real
 * photographs of Bathukamma, dandiya and garba under twinkling lights,
 * petals and lanterns, the offer). Holding
 * pauses it; a swipe changes scene. With reduced motion it stays on the first.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { SCENE_MS, spotlightScenes } from '@zappy/core/shared/season';
import { SpotlightFireworks } from './SpotlightFireworks';
import { SpotlightGreeting } from './SpotlightGreeting';
import { SpotlightOffer } from './SpotlightOffer';
import { SpotlightPetals } from './SpotlightPetals';
import { SpotlightPhoto } from './SpotlightPhoto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function FestiveSpotlight({ season, theme }: { season: Any; theme: Any }) {
  const reduce = useReducedMotion();
  const scenes: Any[] = useMemo(() => spotlightScenes(season), [season]);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const auto = !reduce && scenes.length > 1;

  useEffect(() => {
    if (!auto || paused) return undefined;
    const t = setTimeout(() => setAt((i) => (i + 1) % scenes.length), SCENE_MS);
    return () => clearTimeout(t);
  }, [at, paused, auto, scenes.length]);

  if (!scenes.length) return null;
  const scene = scenes[at % scenes.length];
  const go = (d: number) => setAt((i) => (i + d + scenes.length) % scenes.length);

  return (
    <View style={styles.stage}
      onTouchStart={(e: GestureResponderEvent) => { startX.current = e.nativeEvent.pageX; setPaused(true); }}
      onTouchEnd={(e: GestureResponderEvent) => {
        const dx = e.nativeEvent.pageX - (startX.current ?? e.nativeEvent.pageX);
        startX.current = null; setPaused(false);
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
      onTouchCancel={() => { startX.current = null; setPaused(false); }}>
      {/* key: a new scene mounts afresh, so its animation starts from the beginning. */}
      <Animated.View key={`${scene.key}-${at}`} entering={FadeIn.duration(450)} style={StyleSheet.absoluteFill}>
        {scene.kind === 'curtains' ? <SpotlightGreeting season={season} theme={theme} /> : null}
        {scene.kind === 'photo' ? <SpotlightPhoto scene={scene} theme={theme} /> : null}
        {scene.kind === 'fireworks' ? <SpotlightFireworks season={season} theme={theme} /> : null}
        {scene.kind === 'petals' ? <SpotlightPetals season={season} theme={theme} /> : null}
        {scene.kind === 'offer' ? <SpotlightOffer offer={scene.offer} theme={theme} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { height: 204, marginHorizontal: -16 },
});
