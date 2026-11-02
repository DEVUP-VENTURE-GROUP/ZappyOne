/**
 * The fastest way in: a problem in the customer's own words, straight into the
 * service that fixes it (the website's ProblemChips). Drawn from the catalog's
 * popular problems. The row drifts on its own so every problem is seen; it
 * stops while a finger is on it, and stays still for reduced motion.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { problemPhotoIn } from '@zappy/core/shared/problemArt';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HomeService } from './homeCatalog';

const DRIFT_PX_PER_TICK = 1;
const TICK_MS = 36;   // about 28 px a second, as on the website

export function ProblemChips({ services }: { services: HomeService[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const row = useRef<ScrollView>(null);
  const x = useRef(0);
  const holdUntil = useRef(0);
  const width = useRef({ content: 0, view: 0 });

  const chips = useMemo(() => {
    const out: { code: string; name: string; categoryCode?: string; service: HomeService }[] = [];
    const seen = new Set<string>();
    for (const s of services) for (const h of s.highlights || []) {
      if (seen.has(h.name) || out.length >= 10) continue;
      seen.add(h.name);
      out.push({ ...h, service: s });
    }
    return out;
  }, [services]);

  useEffect(() => {
    if (reduce || chips.length < 4) return undefined;
    const id = setInterval(() => {
      if (Date.now() < holdUntil.current) return;
      const max = width.current.content - width.current.view;
      if (max <= 0) return;
      x.current = x.current >= max ? 0 : x.current + DRIFT_PX_PER_TICK;
      row.current?.scrollTo({ x: x.current, animated: false });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [reduce, chips.length]);

  if (!chips.length) return null;
  return (
    <View style={styles.section}>
      <View>
        <Text variant="heading3" weight="bold">What's wrong?</Text>
        <Text variant="caption" color={ink[500]}>Tap the problem, see the price</Text>
      </View>
      <ScrollView ref={row} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}
        onLayout={(e) => { width.current.view = e.nativeEvent.layout.width; }}
        onContentSizeChange={(w) => { width.current.content = w; }}
        onScroll={(e) => { x.current = e.nativeEvent.contentOffset.x; }} scrollEventThrottle={32}
        onTouchStart={() => { holdUntil.current = Number.MAX_SAFE_INTEGER; }}
        onTouchEnd={() => { holdUntil.current = Date.now() + 3000; }}>
        {chips.map((c) => {
          const Icon = serviceIcon(c.service.icon);
          const photo = webAsset(problemPhotoIn(c.service.artKey || c.service.code, c, c.categoryCode ? { code: c.categoryCode } : null));
          return (
            <Pressable key={`${c.service.code}:${c.code}`} onPress={() => router.push(c.service.path as never)} accessibilityRole="button" accessibilityLabel={`${c.name}, ${c.service.name}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              {photo ? <Image source={{ uri: photo }} style={styles.thumb} resizeMode="cover" /> : <View style={[styles.thumb, styles.iconThumb]}><Icon size={26} strokeWidth={1.6} color={zappy[600]} /></View>}
              <Text variant="bodySmall" weight="semibold" numberOfLines={2}>{c.name}</Text>
              <Text variant="caption" color={ink[500]} numberOfLines={1}>{c.service.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  row: { gap: spacing.md, paddingRight: spacing.base },
  card: { width: 118, gap: 4 },
  pressed: { opacity: 0.85 },
  thumb: { width: 118, aspectRatio: 4 / 5, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: slate[100] },
  iconThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
});
