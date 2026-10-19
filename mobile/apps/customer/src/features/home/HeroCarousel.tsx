/**
 * The top of Home: a photo carousel of everything we do (the website's
 * HeroCarousel, phone layout). Every slide is tied to the live catalog: a slide
 * whose services are not offered is dropped. It moves on by itself every few
 * seconds, pauses while touched, and stays put for reduced motion.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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

/** `services`: catalog codes the slide stands for; it opens the first one offered. Photos are served at /hero. */
const SLIDES = [
  { key: 'car_wash', domain: 'vehicles', services: ['car_wash'], tab: 'Car wash', photo: '/hero/vehicle-care.webp', title: 'Car wash at your parking', line: 'Foam wash, inside vacuum or full clean. From ₹299.' },
  { key: 'bike_wash', domain: 'vehicles', services: ['bike_wash'], tab: 'Bike wash', photo: '/hero/two-wheeler.webp', title: 'Bike wash at your door', line: 'Quick, foam or foam + polish. From ₹99.' },
  { key: 'two_wheeler', domain: 'vehicles', services: ['two_wheeler'], tab: '2-Wheeler', photo: '/hero/two-wheeler.webp', title: 'Bike trouble, sorted', line: 'A mechanic comes to you, at home or on the road.' },
  { key: 'four_wheeler', domain: 'vehicles', services: ['four_wheeler'], tab: '4-Wheeler', photo: '/hero/vehicle-care.webp', title: 'Car care at your door', line: 'Checks and repairs where your car is parked.' },
  { key: 'water_tank_care', domain: 'home_services', services: ['water_tank_care'], tab: 'Water tank', photo: '/hero/water-tank.webp' },
  { key: 'pet_services', domain: 'pet_services', tab: 'Pet care', photo: '/hero/pet-care.webp', path: '/pet' },
  { key: 'helping_services', domain: 'helping_services', tab: 'Shopping & returns', photo: '/hero/helping.webp', path: '/helping' },
  { key: 'events', domain: 'events', tab: 'Events', photo: '/hero/events.webp', path: '/events' },
  { key: 'electronics', domain: 'electronics', services: ['mobile_repair', 'mobile', 'laptop_repair', 'laptop'], tab: 'Phone & laptop', photo: '/hero/phone-repair.webp',
    title: 'Phone or laptop repair', line: 'Fixed at your door. You approve the price before work starts.' },
] as { key: string; domain: string; services?: string[]; tab: string; photo: string; title?: string; line?: string; path?: string }[];
// `line` is the wide-screen sub-line; phones show the title only, as on the website.
const SLIDE_MS = 6000;
const HEIGHT = 190;

export function HeroCarousel({ domains, onOpen }: { domains: HomeDomain[]; onOpen: (s: HomeService, path?: string) => void }) {
  const reduce = useReducedMotion();
  const { width: screen } = useWindowDimensions();
  const width = screen - spacing.base * 2;
  const track = useRef<ScrollView>(null);
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
  const count = slides.length;

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

  if (!count) return null;
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
});
