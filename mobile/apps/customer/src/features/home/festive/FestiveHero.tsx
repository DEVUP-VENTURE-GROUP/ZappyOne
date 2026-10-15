/**
 * The top of home during a festival (the website's FestiveHero; server
 * content/season, set in Admin → Festive home), in the manner of Blinkit's:
 * soft rays and a fine jhalar, the festival's artwork when uploaded, a
 * greeting, a full grid of real-photo tiles that spring in (a tall feature
 * tile when there are five), and its offer. Only live services become tiles; with no season
 * running, home has no festive top at all.
 */
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { FESTIVE_PHOTOS, rayShapes, seasonTiles, tileLayout } from '@zappy/core/shared/season';
import { artFor, servicePhoto } from '@zappy/core/shared/serviceArt';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { FestiveMotif } from './FestiveMotif';
import { FestiveOffer } from './FestiveOffer';
import { FestiveSpotlight } from './FestiveSpotlight';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** Real photos first; a service's own picture or art otherwise. */
const artOf = (s: Any) => webAsset((FESTIVE_PHOTOS as Record<string, string>)[s.code] || servicePhoto(s) || artFor(s.code, s.domainCode)?.still || null);
const RAYS = rayShapes();

export function FestiveHero({ season, theme, services, onOpen }: { season: Any; theme: Any; services: Any[]; onOpen: (s: Any) => void }) {
  const reduce = useReducedMotion();
  const tiles = useMemo(() => seasonTiles(season, services, artOf), [season, services]);
  const { cols, feature } = tileLayout(tiles.length);
  const cell = cols === 3 ? '31.6%' : cols === 2 ? '48.4%' : '100%';
  const enter = (i: number) => (reduce ? undefined : FadeInDown.delay(150 + i * 70).springify().damping(16));

  // A cream card, the title in bold on top, a real photo below, any badge as a ribbon on it.
  const tile = (t: Any, i: number, width: string, big: boolean) => (
    <Animated.View key={t.serviceCode + t.title} entering={enter(i)} style={[{ width: width as Any }, big && styles.flex]}>
      <Pressable onPress={() => onOpen(t.service)} accessibilityRole="button" accessibilityLabel={t.title}
        style={({ pressed }) => [styles.tile, { backgroundColor: theme.tile, borderColor: theme.line }, big && styles.flex, pressed && styles.pressed]}>
        <Text variant={big ? 'body' : 'caption'} weight="black" color={theme.tileInk} numberOfLines={2} style={styles.tileTitle}>{t.title}</Text>
        <View style={[styles.photo, { backgroundColor: theme.line }, big ? styles.flex : { aspectRatio: cols < 3 && !feature ? 4 / 3 : 1 }]}>
          {t.image
            ? <Image source={{ uri: t.image }} style={styles.img} resizeMode="cover" />
            : <Text variant="caption" color={theme.sub} style={styles.center}>{t.service.name}</Text>}
          {t.badge ? <View style={[styles.badge, { backgroundColor: theme.accent }]}><Text variant="caption" weight="black" color="#fff" style={styles.badgeText}>{t.badge.toUpperCase()}</Text></View> : null}
        </View>
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={styles.band}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="festive" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.top} />
            <Stop offset="1" stopColor={theme.bottom} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#festive)" />
      </Svg>
      {theme.rays ? (
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 360 420" preserveAspectRatio="xMidYMin slice" pointerEvents="none">
          {RAYS.map((ray: Any, i: number) => <Path key={i} d={ray.d} fill={ray.fill} opacity={ray.o} />)}
        </Svg>
      ) : null}
      <FestiveMotif theme={season.theme} />

      <View style={styles.body}>
        <FestiveSpotlight season={season} theme={theme} />

        {tiles.length ? (feature ? (
          // Five: a tall feature tile beside a two-by-two block, as on the website.
          <View style={styles.featureRow}>
            <View style={styles.featureCol}>{tile(tiles[0], 0, '100%', true)}</View>
            <View style={[styles.grid, styles.flex]}>{tiles.slice(1).map((t: Any, i: number) => tile(t, i + 1, '47.5%', false))}</View>
          </View>
        ) : (
          <View style={styles.grid}>{tiles.map((t: Any, i: number) => tile(t, i, cell, false))}</View>
        )) : null}

        {season.offer ? (
          <Animated.View entering={reduce ? undefined : FadeInDown.delay(250 + tiles.length * 70).springify().damping(16)}>
            <FestiveOffer offer={season.offer} accent={theme.accent} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { overflow: 'hidden', borderBottomLeftRadius: radius.extraLarge, borderBottomRightRadius: radius.extraLarge },
  artwork: { alignSelf: 'center', width: '100%', height: 110, marginBottom: -4 },
  body: { paddingTop: 38, paddingHorizontal: spacing.base, paddingBottom: spacing.lg, gap: spacing.base },
  head: { alignItems: 'center', gap: 4 },
  greeting: { letterSpacing: 2 },
  headline: { textAlign: 'center', letterSpacing: -0.5 },
  center: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
  featureRow: { flexDirection: 'row', gap: spacing.sm },
  featureCol: { width: '31.6%' },
  tile: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', padding: 6, shadowColor: '#8a5a00', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  pressed: { transform: [{ scale: 0.96 }] },
  tileTitle: { textAlign: 'center', minHeight: 32, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 6 },
  photo: { width: '100%', borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  img: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  badge: { position: 'absolute', bottom: 6, left: 6, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 9, letterSpacing: 0.5 },
});
