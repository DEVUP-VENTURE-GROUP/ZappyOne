import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { ARCH, archEdge, archLights, festivePicks, tileTag } from '@zappy/core/shared/season';
import { servicePhoto, tilePhoto } from '@zappy/core/shared/serviceArt';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { spacing } from '@zappy/ui/theme/spacing';
import { FestiveOffer } from './FestiveOffer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const AnimatedPath = Animated.createAnimatedComponent(Path);

// The arch's lights chase along its edge like a marquee (the website's fz-marquee).
function ArchLights({ color }: { color: string }) {
  const reduce = useReducedMotion();
  const off = useSharedValue(0);
  useEffect(() => { if (!reduce) off.value = withRepeat(withTiming(-22, { duration: 1100, easing: Easing.linear }), -1, false); }, [reduce, off]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: off.value }));
  return <AnimatedPath d={archLights} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray="0 11" animatedProps={props} />;
}

function ZoomPhoto({ uri, delay }: { uri: string; delay: number }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (reduce) return undefined;
    const t = setTimeout(() => { s.value = withRepeat(withTiming(1.08, { duration: 9000, easing: Easing.inOut(Easing.ease) }), -1, true); }, delay);
    return () => clearTimeout(t);
  }, [reduce, s, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.Image source={{ uri }} style={[StyleSheet.absoluteFill, style]} resizeMode="cover" />;
}

function Tile({ t, theme, big, i, onOpen }: { t: Any; theme: Any; big: boolean; i: number; onOpen?: (s: Any) => void }) {
  const reduce = useReducedMotion();
  const ink = theme.dark ? theme.top : theme.ink;
  const tag = tileTag(t, t.service);
  const photo = webAsset(t.imageUrl || tilePhoto(t.service.code) || servicePhoto(t.service));
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(250 + i * 80).springify().damping(15)} style={big ? styles.bigWrap : styles.smallWrap}>
      <Pressable onPress={() => onOpen?.(t.service)} accessibilityRole="button" style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
        {tag ? <View style={[styles.tag, { backgroundColor: theme.dark ? theme.bottom : theme.accent }]}><Text variant="caption" weight="extrabold" color="#FFFFFF">{tag}</Text></View> : null}
        <Text variant={big ? 'body' : 'bodySmall'} weight="extrabold" color={ink} numberOfLines={2} style={[styles.title, !tag && styles.titleTop]}>{t.title || t.service.name}</Text>
        <View style={[styles.photo, { backgroundColor: theme.wash }]}>{photo ? <ZoomPhoto uri={photo} delay={i * 700} /> : null}</View>
      </Pressable>
    </Animated.View>
  );
}

// The festive panel under the festive header (the website's FestiveHero): an arch with chasing lights, the line, the picks and the offer.
export function FestiveHero({ season, theme, services = [], onOpen }: { season: Any; theme: Any; services?: Any[]; onOpen?: (s: Any) => void }) {
  const reduce = useReducedMotion();
  const picks = festivePicks(season.tiles, services, (sv: Any) => tilePhoto(sv.code) || servicePhoto(sv));
  const ink = theme.dark ? theme.top : theme.ink;
  const n = picks.length;
  const bigFirst = n === 3 || n === 5;
  const rest = bigFirst ? picks.slice(1) : picks;
  const cols = n === 6 ? 3 : n === 1 ? 1 : 2;
  const rise = (ms: number) => (reduce ? undefined : FadeInDown.delay(ms).duration(500));

  const restGrid = (
    <View style={styles.wrap}>
      {rest.map((t: Any, i: number) => (
        <View key={t.serviceCode} style={{ width: `${100 / (bigFirst ? (n === 5 ? 2 : 1) : cols)}%`, padding: 5 }}>
          <Tile t={t} theme={theme} big={false} i={bigFirst ? i + 1 : i} onOpen={onOpen} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ backgroundColor: theme.top, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.base }}>
      <Svg width="100%" height={40} viewBox={`0 0 ${ARCH.w} ${ARCH.h}`} preserveAspectRatio="none">
        <Path d={`${archEdge} Z`} fill={theme.wash} />
        <ArchLights color={theme.accent} />
      </Svg>
      <View style={[styles.panel, { backgroundColor: theme.wash }]}>
        {season.greeting ? <Animated.View entering={rise(0)}><Text variant="caption" weight="extrabold" color={theme.dark ? theme.bottom : theme.accent} style={styles.greeting}>{String(season.greeting).toUpperCase()}</Text></Animated.View> : null}
        <Animated.View entering={rise(80)}><Text variant="heading1" weight="black" color={ink} style={styles.headline}>{String(season.headline).toUpperCase()}</Text></Animated.View>
        {season.subline ? <Animated.View entering={rise(140)}><Text variant="bodySmall" weight="semibold" color={ink} style={styles.subline}>{season.subline}</Text></Animated.View> : null}
        {n ? (
          bigFirst ? (
            <View style={styles.row}>
              <View style={{ width: n === 5 ? '33.33%' : '50%', padding: 5 }}><Tile t={picks[0]} theme={theme} big i={0} onOpen={onOpen} /></View>
              <View style={{ flex: 1 }}>{restGrid}</View>
            </View>
          ) : restGrid
        ) : null}
        {season.offer ? <Animated.View entering={rise(500)} style={styles.offer}><FestiveOffer offer={season.offer} accent={theme.accent} /></Animated.View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: -1, paddingHorizontal: 7, paddingBottom: spacing.base, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  greeting: { textAlign: 'center', letterSpacing: 2.4 },
  headline: { textAlign: 'center', fontSize: 27, lineHeight: 30, letterSpacing: -0.5, marginTop: 2 },
  subline: { textAlign: 'center', opacity: 0.8, marginTop: 6, marginBottom: spacing.sm, paddingHorizontal: spacing.sm },
  row: { flexDirection: 'row', marginTop: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 0 },
  bigWrap: { flex: 1, minHeight: 352 },
  smallWrap: { height: 170 },
  tile: { flex: 1, overflow: 'hidden', borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  pressed: { transform: [{ scale: 0.97 }] },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderBottomRightRadius: 12 },
  title: { textAlign: 'center', paddingHorizontal: 8, paddingTop: 6 },
  titleTop: { paddingTop: 12 },
  photo: { flex: 1, margin: 8, marginTop: 8, borderRadius: 12, overflow: 'hidden' },
  offer: { marginTop: spacing.md, paddingHorizontal: 5 },
});
