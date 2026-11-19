// The top of Home (the website's HeroCarousel): admin hero banners when there are any, else photo slides tied to the live catalog.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { PITCH } from '@zappy/core/shared/serviceArt';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HomeDomain, HomeService } from './homeCatalog';
import { PromoBanner, bannerHeight, type HomeAd } from './PromoBanner';

/** `services`: catalog codes the slide stands for; it opens the first one offered. Photos are served at /hero. */
const SLIDES = [
  { key: 'car_wash', domain: 'vehicles', services: ['car_wash'], tab: 'Car wash', photo: '/hero/vehicle-care.webp', title: 'Car wash at your parking', line: 'Foam wash, inside vacuum or full clean. From ₹299.' },
  { key: 'bike_wash', domain: 'vehicles', services: ['bike_wash'], tab: 'Bike wash', photo: '/hero/two-wheeler.webp', title: 'Bike wash at your door', line: 'Foam wash, chain clean and lube, or polish. From ₹99.' },
  { key: 'two_wheeler', domain: 'vehicles', services: ['two_wheeler'], tab: '2-Wheeler', photo: '/hero/two-wheeler.webp', title: 'Bike trouble, sorted', line: 'A mechanic comes to you, at home or on the road.' },
  { key: 'four_wheeler', domain: 'vehicles', services: ['four_wheeler'], tab: '4-Wheeler', photo: '/hero/vehicle-care.webp', title: 'Car care at your door', line: 'Checks and repairs where your car is parked.' },
  { key: 'water_tank_care', domain: 'home_services', services: ['water_tank_care'], tab: 'Water tank', photo: '/hero/water-tank.webp' },
  { key: 'pet_services', domain: 'pet_services', tab: 'Pet care', photo: '/hero/pet-care.webp', path: '/pet' },
  { key: 'family_assist', domain: 'family_assist', tab: 'Family Assist', photo: '/hero/helping.webp', path: '/helping' },
  { key: 'events', domain: 'events', tab: 'Events', photo: '/hero/events.webp', path: '/events' },
  { key: 'electronics', domain: 'electronics', services: ['mobile_repair', 'mobile', 'laptop_repair', 'laptop'], tab: 'Phone & laptop', photo: '/hero/phone-repair.webp',
    title: 'Phone or laptop repair', line: 'Fixed at your door. You approve the price before work starts.' },
] as { key: string; domain: string; services?: string[]; tab: string; photo: string; title?: string; line?: string; path?: string }[];
// `line` is the wide-screen sub-line; phones show the title only, as on the website.
const SLIDE_MS = 6000;
const HEIGHT = 188;

export function HeroCarousel({ banners = [], domains, onOpen, onOpenBanner, onImageError }: {
  banners?: HomeAd[]; domains: HomeDomain[]; onOpen: (s: HomeService, path?: string) => void; onOpenBanner?: (ad: HomeAd) => void; onImageError?: () => void;
}) {
  const reduce = useReducedMotion();
  const { width: screen } = useWindowDimensions();
  const width = screen - spacing.base * 2;
  const track = useRef<ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  const [pausedUntil, setPausedUntil] = useState(0);

  const slides = useMemo(() => {
    const byCode = new Map(domains.map((d) => [d.code, d]));
    return SLIDES.map((s) => {
      const domain = byCode.get(s.domain);
      const services = domain?.services || [];
      const target = s.services ? s.services.map((c) => services.find((x) => x.code === c)).find(Boolean)
        : services.find((x) => x.available !== false) || services[0];
      return target && domain ? { ...s, target, domain } : null;
    }).filter(Boolean) as ({ target: HomeService; domain: HomeDomain } & (typeof SLIDES)[number])[];
  }, [domains]);
  const useBanners = banners.length > 0;
  const count = useBanners ? banners.length : slides.length;
  // The track is exactly as tall as its banners (a taller track showed a dark strip under each one).
  const bannerTrack = useBanners ? Math.max(...banners.map((ad) => bannerHeight(ad, 'hero', width))) : HEIGHT;

  function go(i: number) {
    if (!count) return;
    const next = (i + count) % count;
    track.current?.scrollTo({ x: next * width, animated: !reduce });
    setIndex(next);
  }

  useEffect(() => {
    if (reduce || count < 2) return undefined;
    const t = setInterval(() => { if (Date.now() >= pausedUntil) go(index + 1); }, SLIDE_MS);
    return () => clearInterval(t);
  }, [index, count, reduce, pausedUntil]); // eslint-disable-line react-hooks/exhaustive-deps

  // A source switch (catalog slides, then banners once they load) starts from the first slide.
  useEffect(() => { track.current?.scrollTo({ x: 0, animated: false }); setIndex(0); }, [useBanners]);

  if (!count) return null;
  if (useBanners) {
    return (
      <View style={styles.section}>
        <ScrollView ref={track} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={[styles.track, { width, height: bannerTrack, backgroundColor: '#E8EEFB' }]}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          onTouchStart={() => setPausedUntil(Date.now() + SLIDE_MS * 2)}>
          {banners.map((ad) => <PromoBanner key={ad._id} ad={ad} variant="hero" width={width} onOpen={onOpenBanner} onImageError={onImageError} />)}
        </ScrollView>
        {count > 1 ? (
          <View style={styles.dots}>
            {banners.map((ad, i) => (
              <Pressable key={ad._id} onPress={() => go(i)} hitSlop={6} accessibilityRole="tab" accessibilityLabel={`Slide ${i + 1} of ${count}`} accessibilityState={{ selected: i === index }}
                style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <ScrollView ref={track} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={[styles.track, { width }]}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        onTouchStart={() => setPausedUntil(Date.now() + SLIDE_MS * 2)}>
        {slides.map((s, i) => {
          const [pTitle] = (PITCH as Record<string, string[]>)[s.domain.code] || [s.domain.name];
          return (
            <View key={s.key} style={{ width, height: HEIGHT }} accessibilityElementsHidden={i !== index}>
              <Image source={{ uri: webAsset(s.photo) || undefined }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={styles.scrim} />
              <View style={styles.copy}>
                <Text variant="caption" weight="semibold" color="rgba(255,255,255,0.75)">{s.domain.name.toUpperCase()}</Text>
                <Text variant="heading3" weight="bold" color="#fff" numberOfLines={2}>{s.title || (s.services ? s.target.name : pTitle)}</Text>
                <Pressable onPress={() => onOpen(s.target, s.path)} accessibilityRole="button" style={styles.book}>
                  <Text variant="caption" weight="semibold" color={ink[900]}>Book now</Text><ArrowRight size={15} color={ink[900]} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
      {count > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {slides.map((s, i) => (
            <Pressable key={s.key} onPress={() => go(i)} accessibilityRole="tab" accessibilityState={{ selected: i === index }} style={[styles.tab, i === index && styles.tabOn]}>
              <Text variant="caption" weight="semibold" color={i === index ? '#fff' : ink[700]}>{s.tab}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  track: { height: HEIGHT, borderRadius: radius.large, overflow: 'hidden', backgroundColor: ink[900] },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  copy: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 4, padding: spacing.base },
  book: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 36, marginTop: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.button, backgroundColor: '#fff' },
  tabs: { gap: spacing.sm },
  tab: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabOn: { backgroundColor: zappy[600], borderColor: zappy[600] },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ink[300] },
  dotOn: { width: 22, backgroundColor: zappy[600] },
});
