// Everything bookable here, by area (Asif's design): a chip per area that follows ?category=, photo cards three to a row; only live services show.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PackageSearch } from 'lucide-react-native';
import { useGetServiceabilityQuery, useLiveCatalogQuery } from '@zappy/core/api';
import { loadGeoLocation, type CachedLocation } from '@zappy/core/lib/geoCache';
import { trackSearch } from '@zappy/core/lib/telemetry';
import { areaPhoto, servicePhoto } from '@zappy/core/shared/serviceArt';
import { icon3dFor } from '@zappy/core/shared/icons3d';
import { EmptyState, ErrorState, ScreenHeader, Skeleton, Text } from '@zappy/ui/components';
import { GlassSurface } from '@zappy/ui/components/Glass';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { tintFor } from '../home/ServiceGrid';

interface Service { code: string; name: string; icon?: string; path: string; imageUrl?: string }
interface Domain { code: string; name: string; imageUrl?: string; services: Service[] }
const GAP = 10;

function ServiceCard({ service, domainCode, width, onPress }: { service: Service; domainCode: string; width: number; onPress: () => void }) {
  const [broken, setBroken] = useState(false);
  // A photo that fails to load (offline, website down) gives way to the 3D icon.
  const photo = broken ? null : webAsset(servicePhoto(service));
  const tint = tintFor(domainCode);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={service.name} style={[styles.card, { width }]}>
      <View style={[styles.cardPhoto, { height: Math.round(width * 0.8), backgroundColor: tint.bg }]}>
        {photo ? <Image source={{ uri: photo }} style={styles.fill} resizeMode="cover" onError={() => setBroken(true)} />
          : <Image source={{ uri: webAsset(icon3dFor({ ...service, domainCode })) || undefined }} style={styles.icon3d} resizeMode="contain" accessibilityIgnoresInvertColors />}
      </View>
      <Text variant="caption" weight="semibold" numberOfLines={2} style={styles.cardLabel}>{service.name}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress, onX }: { label: string; active: boolean; onPress: () => void; onX?: (x: number) => void }) {
  return (
    <View onLayout={onX ? (e) => onX(e.nativeEvent.layout.x) : undefined}>
    <GlassSurface style={styles.chipShape} fallbackStyle={[styles.chip, active && styles.chipOn]} tint={active ? zappy[600] : undefined} interactive>
      <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} style={styles.chipTap}>
        <Text variant="caption" weight="semibold" color={active ? '#fff' : ink[700]}>{label}</Text>
      </Pressable>
    </GlassSurface>
    </View>
  );
}

function AreaHead({ domain, count }: { domain: Domain; count: number }) {
  const [broken, setBroken] = useState(false);
  const photo = broken ? null : webAsset(areaPhoto(domain));
  return (
    <View style={styles.head}>
      <View style={[styles.headThumb, { backgroundColor: tintFor(domain.code).bg }]}>
        <Image source={{ uri: (photo || webAsset(icon3dFor(domain))) || undefined }} style={photo ? styles.fill : styles.icon3d} resizeMode={photo ? 'cover' : 'contain'}
          onError={photo ? () => setBroken(true) : undefined} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyLarge" weight="bold" numberOfLines={1} accessibilityRole="header">{domain.name}</Text>
        <Text variant="caption" color={ink[500]}>{count} {count === 1 ? 'service' : 'services'}</Text>
      </View>
    </View>
  );
}

export function AllServicesPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - spacing.base * 2 - GAP * 2) / 3);
  const params = useLocalSearchParams<{ category?: string }>();
  // undefined: still reading the saved place; null: none saved (everything shows, the booking step asks for an address).
  const [here, setHere] = useState<CachedLocation | null | undefined>(undefined);
  useEffect(() => { loadGeoLocation().then((l) => setHere(l ?? null)).catch(() => setHere(null)); }, []);
  const { data: svc, isFetching: checkingArea, refetch: refetchArea } = useGetServiceabilityQuery({ lat: here?.lat, lng: here?.lng }, { skip: here?.lat == null });
  const { data, isLoading, isError, refetch } = useLiveCatalogQuery();
  // Hold the skeleton until we know what is bookable here, so the full catalog never flashes before it narrows.
  const settling = isLoading || here === undefined || (here?.lat != null && !svc && checkingArea);
  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    try { await Promise.all([refetch(), here?.lat != null ? refetchArea() : null]); } finally { setRefreshing(false); }
  }

  // Only what a live pro covers at this address; unknown location shows everything (the booking step asks for an address).
  const domains: Domain[] = useMemo(() => {
    const live = svc && svc.status !== 'not_here' ? new Set<string>(svc.lines.map((l: { code: string }) => l.code)) : null;
    return ((data?.domains || []) as Domain[]).map((d) => ({ ...d, services: d.services.filter((s) => !live || live.has(s.code)) })).filter((d) => d.services.length);
  }, [data, svc]);
  const selected = domains.some((d) => d.code === params.category) ? (params.category as string) : 'all';
  const visible = selected === 'all' ? domains : domains.filter((d) => d.code === selected);

  // Opened from Home at an area far along the bar, or a chip tapped: bring that chip into view and start the list from the top.
  const chipBar = useRef<ScrollView>(null);
  const list = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  const [chipsLaidOut, setChipsLaidOut] = useState(0);
  useEffect(() => {
    const x = chipX.current[selected];
    if (x != null) chipBar.current?.scrollTo({ x: Math.max(0, x - spacing.base * 2), animated: true });
  }, [selected, chipsLaidOut]);
  useEffect(() => { list.current?.scrollTo({ y: 0, animated: false }); }, [selected]);
  const placeChip = (code: string) => (x: number) => {
    const first = chipX.current[code] == null;
    chipX.current[code] = x;
    if (first && code === selected) setChipsLaidOut((n) => n + 1);
  };

  function open(s: Service) {
    trackSearch({ category: s.code, lat: here?.lat, lng: here?.lng, result: 'served', userType: 'user' });
    router.push(s.path as never);
  }

  let body: React.ReactNode = null;
  if (settling) body = <View style={styles.grid}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width={tile} height={Math.round(tile * 1.2)} />)}</View>;
  else if (isError) body = <ErrorState message="Could not load services." onRetry={refetch} />;
  else if (!domains.length) body = <EmptyState icon={<PackageSearch size={28} color={zappy[600]} />} title="Nothing bookable here yet" message="New pros join every week. Try another address." />;
  else {
    body = visible.map((d) => (
      <View key={d.code} style={styles.section}>
        <AreaHead domain={d} count={d.services.length} />
        <View style={styles.grid}>{d.services.map((s) => <ServiceCard key={s.code} service={s} domainCode={d.code} width={tile} onPress={() => open(s)} />)}</View>
      </View>
    ));
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="All services" subtitle="What we can do for you today" safeArea />
      {domains.length > 1 ? (
        <ScrollView ref={chipBar} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipBar}>
          <Chip label="All" active={selected === 'all'} onPress={() => router.setParams({ category: 'all' })} onX={placeChip('all')} />
          {domains.map((d) => <Chip key={d.code} label={d.name} active={selected === d.code} onPress={() => router.setParams({ category: d.code })} onX={placeChip(d.code)} />)}
        </ScrollView>
      ) : null}
      <ScrollView ref={list} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>{body}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  icon3d: { width: '60%', height: '60%' },
  body: { padding: spacing.base, gap: spacing.xl, paddingBottom: spacing.xxxl },
  chipBar: { flexGrow: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  chipShape: { minHeight: 34, borderRadius: radius.pill, overflow: 'hidden' },
  chipTap: { minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.md },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: zappy[600], borderColor: zappy[600] },
  section: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headThumb: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: GAP },
  card: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardPhoto: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardLabel: { paddingHorizontal: 8, paddingVertical: 8, minHeight: 44 },
});
