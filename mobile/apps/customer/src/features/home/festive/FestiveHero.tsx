/**
 * The top of home during a festival (the website's FestiveHero; server
 * content/season, set in Admin → Festive home): the festival's colours and
 * moving decoration, a greeting, its services as tiles that spring in one by
 * one, and its offer. Only live services become tiles; with no season
 * running, home has no festive top at all.
 */
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { seasonTiles } from '@zappy/core/shared/season';
import { artFor, servicePhoto } from '@zappy/core/shared/serviceArt';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { FestiveMotif } from './FestiveMotif';
import { FestiveOffer } from './FestiveOffer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const artOf = (s: Any) => webAsset(servicePhoto(s) || artFor(s.code, s.domainCode)?.still || null);

export function FestiveHero({ season, theme, services, onOpen }: { season: Any; theme: Any; services: Any[]; onOpen: (s: Any) => void }) {
  const reduce = useReducedMotion();
  const tiles = useMemo(() => seasonTiles(season, services, artOf), [season, services]);
  const enter = (i: number) => (reduce ? undefined : FadeInDown.delay(150 + i * 70).springify().damping(16));

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
      <FestiveMotif theme={season.theme} />
      {/* A soft glow behind the greeting, like light from the decoration. */}
      <Animated.View entering={reduce ? undefined : ZoomIn.duration(900)} pointerEvents="none"
        style={[styles.glow, { backgroundColor: theme.accent, opacity: theme.dark ? 0.22 : 0.14 }]} />

      <View style={styles.body}>
        <Animated.View entering={reduce ? undefined : FadeInDown.duration(500)} style={styles.head}>
          {season.greeting ? <Text variant="caption" weight="bold" color={theme.accent} style={styles.greeting}>{season.greeting.toUpperCase()}</Text> : null}
          <Text variant="heading1" weight="black" color={theme.ink} style={styles.headline}>{season.headline}</Text>
          {season.subline ? <Text variant="bodySmall" color={theme.sub} style={styles.center}>{season.subline}</Text> : null}
        </Animated.View>

        {tiles.length ? (
          <View style={styles.grid}>
            {tiles.map((t: Any, i: number) => (
              <Animated.View key={t.serviceCode + t.title} entering={enter(i)} style={styles.cell}>
                <Pressable onPress={() => onOpen(t.service)} accessibilityRole="button" accessibilityLabel={t.title}
                  style={({ pressed }) => [styles.tile, { backgroundColor: theme.tile, borderColor: theme.line }, pressed && styles.pressed]}>
                  <Text variant="caption" weight="bold" color={theme.tileInk} numberOfLines={2} style={styles.tileTitle}>{t.title}</Text>
                  <View style={styles.art}>
                    {t.image
                      ? <Image source={{ uri: t.image }} style={styles.img} resizeMode="contain" />
                      : <Text variant="caption" color={theme.sub} style={styles.center}>{t.service.name}</Text>}
                  </View>
                  {t.badge ? <View style={[styles.badge, { backgroundColor: theme.accent }]}><Text variant="caption" weight="black" color="#fff" style={styles.badgeText}>{t.badge.toUpperCase()}</Text></View> : null}
                </Pressable>
              </Animated.View>
            ))}
          </View>
        ) : null}

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
  glow: { position: 'absolute', top: 60, alignSelf: 'center', width: 220, height: 220, borderRadius: 110 },
  body: { paddingTop: 108, paddingHorizontal: spacing.base, paddingBottom: spacing.lg, gap: spacing.base },
  head: { alignItems: 'center', gap: 4 },
  greeting: { letterSpacing: 2 },
  headline: { textAlign: 'center', letterSpacing: -0.5 },
  center: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { width: '31.6%' },
  tile: { borderRadius: radius.large, borderWidth: 1, overflow: 'hidden', paddingTop: spacing.sm },
  pressed: { transform: [{ scale: 0.96 }] },
  tileTitle: { textAlign: 'center', minHeight: 32, paddingHorizontal: 6 },
  art: { aspectRatio: 1, width: '100%', alignItems: 'center', justifyContent: 'center', padding: 6 },
  img: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: 6, left: 6, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 9, letterSpacing: 0.5 },
});
