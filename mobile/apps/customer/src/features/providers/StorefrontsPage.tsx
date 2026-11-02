/**
 * Choose who comes (the website's StorefrontsPage): everyone near the customer
 * verified and priced for one service, sorted their way, or Fastest available.
 */
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, Clock3, MapPin, Star, Store, Timer, Zap } from 'lucide-react-native';
import { useRepairVerticalsQuery, useStorefrontsQuery } from '@zappy/core/api';
import { loadGeoLocation, type CachedLocation } from '@zappy/core/lib/geoCache';
import { Appear, Chip, EmptyState, ScreenHeader, Skeleton, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PlansNear } from '../plans/PlansNear';

export interface Storefront { kind: 'shop' | 'worker'; id: string; name: string; partnerType: string; imageUrl?: string | null; rating: number | null; reviewCount: number; completedJobs: number; distanceKm?: number | null; arrivalMinutes?: number | null; arrivalWithinPromise?: boolean; onTimeRate?: number | null; fromPaise: number; jobs: number; openNow?: boolean | null }

const SORTS = [['best', 'Recommended'], ['fastest', 'Arrives soonest'], ['cheapest', 'Lowest price'], ['rating', 'Top rated'], ['nearest', 'Nearest']] as const;
const KIND: Record<string, string> = { shop: 'Shop', agency: 'Agency', company: 'Service company', individual: 'Independent pro' };
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

function Card({ s, onOpen }: { s: Storefront; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} android_ripple={RIPPLE} accessibilityRole="button" accessibilityLabel={s.name} style={styles.card}>
      <View style={styles.cover}>{s.imageUrl ? <Image source={{ uri: s.imageUrl }} style={StyleSheet.absoluteFill} /> : <Store size={24} color={zappy[400]} />}</View>
      <View style={styles.flex}>
        <View style={styles.between}>
          <Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.shrink}>{s.name}</Text>
          {s.rating != null
            ? <View style={styles.rating}><Star size={10} color="#fff" fill="#fff" /><Text variant="caption" weight="bold" color="#fff">{s.rating.toFixed(1)}</Text></View>
            : <View style={styles.newTag}><Text variant="caption" weight="bold" color={ink[700]}>New</Text></View>}
        </View>
        <View style={styles.inline}><BadgeCheck size={12} color={zappy[600]} /><Text variant="caption" color={ink[500]} numberOfLines={1}>Verified {KIND[s.partnerType] || 'provider'}{s.completedJobs ? ` · ${s.completedJobs} jobs done` : ''}</Text></View>
        <View style={styles.meta}>
          {s.arrivalMinutes != null ? <View style={styles.inline}><Timer size={12} color={s.arrivalWithinPromise ? success[600] : ink[700]} /><Text variant="caption" weight="semibold" color={s.arrivalWithinPromise ? success[600] : ink[700]}>~{s.arrivalMinutes} min</Text></View> : null}
          {s.distanceKm != null ? <View style={styles.inline}><MapPin size={12} color={ink[700]} /><Text variant="caption" weight="semibold" color={ink[700]}>{s.distanceKm < 1 ? `${Math.round(s.distanceKm * 1000)} m` : `${s.distanceKm.toFixed(1)} km`}</Text></View> : null}
          {s.onTimeRate != null ? <View style={styles.inline}><Clock3 size={12} color={ink[700]} /><Text variant="caption" weight="semibold" color={ink[700]}>{Math.round(s.onTimeRate * 100)}% on time</Text></View> : null}
        </View>
        <Text variant="caption" color={ink[700]}>{s.jobs} on the menu · from <Text variant="caption" weight="bold" color={ink[900]}>{rupees(s.fromPaise)}</Text></Text>
        {s.openNow === false ? <Text variant="caption" weight="bold" color={ink[400]}>Closed now</Text> : null}
      </View>
    </Pressable>
  );
}

export function StorefrontsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const vertical = String(slug).replace(/-/g, '_');
  const [loc, setLoc] = useState<CachedLocation | null | undefined>(undefined);
  const [sort, setSort] = useState<string>('best');
  useEffect(() => { loadGeoLocation().then(setLoc); }, []);
  const { data: services } = useRepairVerticalsQuery(undefined);
  const service = useMemo(() => (services?.items || []).find((i: { vertical: string }) => i.vertical === vertical), [services, vertical]);
  const { data, isLoading, isFetching } = useStorefrontsQuery({ vertical, lat: loc?.lat, lng: loc?.lng, sort }, { skip: !loc });
  const items: Storefront[] = data?.items || [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));
  const flowPath = service?.path || `/repair/${slug}`;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={service?.name || 'Providers near you'} subtitle="Choose who comes" onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable onPress={() => router.push(flowPath as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.fast}>
          <View style={styles.fastIcon}><Zap size={20} color="#fff" /></View>
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="bold" color="#fff">Fastest available</Text>
            <Text variant="caption" color="rgba(255,255,255,0.85)">Pick the job, and the nearest verified pro who can take it is rung for you.</Text>
          </View>
        </Pressable>
        <PlansNear vertical={vertical} loc={loc || null} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SORTS.map(([k, l]) => <Chip key={k} label={l} selected={sort === k} onPress={() => setSort(k)} />)}
        </ScrollView>
        {loc === null ? <EmptyState icon={<MapPin size={28} color={slate[300]} />} title="Set your location" message="Choose your location on the home screen to see who can come to you." /> : null}
        {loc && (isLoading || (isFetching && !items.length)) ? [0, 1, 2].map((k) => <Skeleton key={k} height={104} style={styles.skel} />) : null}
        {loc && !isLoading && !isFetching && !items.length ? <EmptyState icon={<Store size={28} color={slate[300]} />} title="No one listed here yet" message="Book Fastest available and we ring every verified pro who covers your address." /> : null}
        {items.length ? <Text variant="caption" weight="semibold" color={ink[500]}>{data.total} verified {data.total === 1 ? 'provider covers' : 'providers cover'} your address</Text> : null}
        {items.map((s, i) => (
          <Appear key={`${s.kind}:${s.id}:${sort}`} delay={Math.min(i, 8) * 40}>
            <Card s={s} onOpen={() => router.push({ pathname: '/storefront/[kind]/[id]', params: { kind: s.kind, id: s.id, service: vertical, name: s.name, arrival: s.arrivalMinutes ?? '' } } as never)} />
          </Appear>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  fast: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.extraLarge, backgroundColor: zappy[600] },
  fastIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  chips: { gap: spacing.sm },
  skel: { borderRadius: radius.large },
  card: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cover: { width: 76, height: 76, borderRadius: radius.medium, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  shrink: { flexShrink: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: success[600] },
  newTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: slate[100] },
});
