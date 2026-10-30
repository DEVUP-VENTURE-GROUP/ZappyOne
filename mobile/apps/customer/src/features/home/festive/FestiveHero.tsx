import { Image, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { rayShapes } from '@zappy/core/shared/season';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { FestiveMotif } from './FestiveMotif';
import { FestiveOffer } from './FestiveOffer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const RAYS = rayShapes();

// The top of home during a festival (the website's FestiveHero), as Blinkit does it: one festive band, one line and the offer; the services stay in the grid below.
export function FestiveHero({ season, theme }: { season: Any; theme: Any; services?: Any[]; onOpen?: (s: Any) => void }) {
  const reduce = useReducedMotion();
  const rise = (ms: number) => (reduce ? undefined : FadeInDown.delay(ms).springify().damping(16));
  const art = webAsset(season.artUrl || null);
  return (
    <View style={[styles.band, { backgroundColor: theme.bottom }]}>
      {theme.rays ? (
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 360 420" preserveAspectRatio="xMidYMin slice" pointerEvents="none">
          {RAYS.map((ray: Any, i: number) => <Path key={i} d={ray.d} fill={ray.fill} opacity={ray.o} />)}
        </Svg>
      ) : null}
      <FestiveMotif theme={season.theme} />

      <View style={styles.body}>
        <Animated.View entering={rise(0)} style={styles.row}>
          <View style={styles.text}>
            {season.greeting ? <Text variant="caption" weight="black" color={theme.accent} style={styles.greeting}>{String(season.greeting).toUpperCase()}</Text> : null}
            <Text variant="heading2" weight="black" color={theme.ink} style={styles.headline}>{season.headline}</Text>
            {season.subline ? <Text variant="bodySmall" color={theme.sub}>{season.subline}</Text> : null}
          </View>
          {art ? <Image source={{ uri: art }} style={styles.art} resizeMode="cover" /> : null}
        </Animated.View>

        {season.offer ? (
          <Animated.View entering={rise(200)}>
            <FestiveOffer offer={season.offer} accent={theme.accent} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { overflow: 'hidden', borderBottomLeftRadius: radius.extraLarge, borderBottomRightRadius: radius.extraLarge },
  body: { paddingTop: 112, paddingHorizontal: spacing.base, paddingBottom: spacing.lg, gap: spacing.base },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  text: { flex: 1, minWidth: 0, gap: 4 },
  greeting: { letterSpacing: 2 },
  headline: { letterSpacing: -0.5 },
  art: { width: 88, height: 88, borderRadius: radius.large },
});
