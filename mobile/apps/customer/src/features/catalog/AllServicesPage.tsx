// Everything bookable here, by area (Asif's design): a chip per area that follows ?category=, photo cards three to a row; only live services show.
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PackageSearch } from 'lucide-react-native';
import { useGetServiceabilityQuery, useLiveCatalogQuery } from '@zappy/core/api';
import { loadGeoLocation, type CachedLocation } from '@zappy/core/lib/geoCache';
import { trackSearch } from '@zappy/core/lib/telemetry';
import { areaPhoto, servicePhoto } from '@zappy/core/shared/serviceArt';
import { EmptyState, ErrorState, ScreenHeader, Skeleton, Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { tintFor } from '../home/ServiceGrid';

interface Service { code: string; name: string; icon?: string; path: string; imageUrl?: string }
interface Domain { code: string; name: string; imageUrl?: string; services: Service[] }
const GAP = 10;

function ServiceCard({ service, domainCode, width, onPress }: { service: Service; domainCode: string; width: number; onPress: () => void }) {
  const photo = webAsset(servicePhoto(service));
  const tint = tintFor(domainCode);
  const Icon = serviceIcon(service.icon);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={service.name} style={[styles.card, { width }]}>
      <View style={[styles.cardPhoto, { height: Math.round(width * 0.8), backgroundColor: tint.bg }]}>
        {photo ? <Image source={{ uri: photo }} style={styles.fill} resizeMode="cover" /> : <Icon size={28} color={tint.fg} strokeWidth={1.8} />}
      </View>
      <Text variant="caption" weight="semibold" numberOfLines={2} style={styles.cardLabel}>{service.name}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.chip, active && styles.chipOn]}>
      <Text variant="caption" weight="semibold" color={active ? '#fff' : ink[700]}>{label}</Text>
    </Pressable>
  );
}

function AreaHead({ domain, count }: { domain: Domain; count: number }) {
  const photo = webAsset(areaPhoto(domain));
  return (
    <View style={styles.head}>
      <View style={[styles.headThumb, { backgroundColor: tintFor(domain.code).bg }]}>
        {photo ? <Image source={{ uri: photo }} style={styles.fill} resizeMode="cover" /> : null}
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
  const [here, setHere] = useState<CachedLocation | null>(null);
  useEffect(() => { loadGeoLocation().then(setHere); }, []);
  const { data: svc } = useGetServiceabilityQuery({ lat: here?.lat, lng: here?.lng }, { skip: here?.lat == null });
  const { data, isLoading, isError, refetch } = useLiveCatalogQuery();

  // Only what a live pro covers at this address; unknown location shows everything (the booking step asks for an address).
  const domains: Domain[] = useMemo(() => {
    const live = svc && svc.status !== 'not_here' ? new Set<string>(svc.lines.map((l: { code: string }) => l.code)) : null;
    return ((data?.domains || []) as Domain[]).map((d) => ({ ...d, services: d.services.filter((s) => !live || live.has(s.code)) })).filter((d) => d.services.length);
  }, [data, svc]);
  const selected = domains.some((d) => d.code === params.category) ? (params.category as string) : 'all';
  const visible = selected === 'all' ? domains : domains.filter((d) => d.code === selected);

  function open(s: Service) {
    trackSearch({ category: s.code, lat: here?.lat, lng: here?.lng, result: 'served', userType: 'user' });
    router.push(s.path as never);
  }

  let body: React.ReactNode = null;
  if (isLoading) body = <View style={styles.grid}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width={tile} height={Math.round(tile * 1.2)} />)}</View>;
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipBar}>
          <Chip label="All" active={selected === 'all'} onPress={() => router.setParams({ category: 'all' })} />
          {domains.map((d) => <Chip key={d.code} label={d.name} active={selected === d.code} onPress={() => router.setParams({ category: d.code })} />)}
        </ScrollView>
      ) : null}
      <ScrollView contentContainerStyle={styles.body}>{body}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  body: { padding: spacing.base, gap: spacing.xl, paddingBottom: spacing.xxxl },
  chipBar: { flexGrow: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  chip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: zappy[600], borderColor: zappy[600] },
  section: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headThumb: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: GAP },
  card: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardPhoto: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardLabel: { paddingHorizontal: 8, paddingVertical: 8, minHeight: 44 },
});
