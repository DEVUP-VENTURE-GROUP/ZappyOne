/**
 * Services — every service a customer can actually book today, in the same
 * 3D-tile style as Home. Home shows the service areas; "More Services" and
 * "View All" land here.
 * ----------------------------------------------------------------------------
 * Built on the live catalog (`GET /provider/onboarding/catalog`):
 *
 *     DOMAIN (area) → SERVICE → COVERAGE heading → PROBLEMS
 *
 * The live catalog returns only lines that are live AND have an approved
 * `ProviderEnrolment` — the same list providers are verified against — so a
 * customer can never browse into a service nobody can fulfil. It carries no
 * prices or ratings, so neither is shown (nothing here is invented).
 *
 * `?category=<domain code>` narrows to one area (Home's area tiles link here
 * that way); `all` or an unknown value shows everything — a stale link
 * degrades to the full catalog, never to a dead end. The chip row rewrites the
 * same param, so the URL and the screen always agree.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, Image, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, PackageSearch } from 'lucide-react-native';
import { EmptyState, ErrorState, GlassSurface, ScalePressable, Skeleton, Text } from '../../components/ui';
import { HOME_BG } from '../../components/home/HomeSections';
import { GradientFill, icon3d, icon3dKey, pastelFor } from '../../components/home/icons3d';
import { areaPhoto } from '../../components/home/areaPhotos';
import { servicePhoto } from '../../components/home/servicePhotos';
import { useGetLiveCatalogQuery } from '../../services/api/catalogApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { ink } from '../../theme/brand';
import { useTabBarSpace } from '../../hooks/useTabBarSpace';
import type { LiveCatalogDomain, LiveCatalogService } from '../../types/api';

const PAD = 16;
const COLS = 3;
const GAP = 12;
const CARD_RADIUS = 14;
const NAVY = '#14205A';
const BLUE = '#2251E0';

export default function ServicesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.min(screenWidth, 720) - PAD * 2;
  const tile = Math.floor((contentWidth - GAP * (COLS - 1)) / COLS);

  const params = useLocalSearchParams<{ category?: string }>();
  const { data: domains, isLoading, isError, error, refetch, isFetching } = useGetLiveCatalogQuery();

  const all = useMemo(() => domains ?? [], [domains]);
  const selected = useMemo(() => {
    const needle = (params.category ?? '').toLowerCase();
    return all.find((d) => d.code.toLowerCase() === needle)?.code ?? 'all';
  }, [all, params.category]);
  const visible = useMemo(() => (selected === 'all' ? all : all.filter((d) => d.code === selected)), [all, selected]);
  const total = useMemo(() => all.reduce((n, d) => n + d.services.length, 0), [all]);

  const pick = useCallback((code: string) => router.setParams({ category: code }), [router]);

  // Keep the selected chip in view — Home's area tiles can select one that
  // starts off-screen to the right.
  const chipsRef = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  const scrollToChip = useCallback((code: string, animated = true) => {
    const x = chipX.current[code];
    if (x != null) chipsRef.current?.scrollTo({ x: Math.max(0, x - PAD), animated });
  }, []);
  useEffect(() => { scrollToChip(selected); }, [selected, scrollToChip]);
  const openService = useCallback(
    (service: LiveCatalogService) => router.push(`/service/${service.code}` as never),
    [router],
  );

  const renderDomain = useCallback(({ item }: { item: LiveCatalogDomain }) => {
    const headPhoto = areaPhoto(item.code, item.imageUrl);
    return (
      <View style={styles.domain}>
        <View style={styles.domainHead}>
          <View style={styles.domainThumb}>
            {headPhoto ? (
              <Image source={headPhoto} style={styles.domainThumbImg} resizeMode="cover" />
            ) : (
              <>
                <GradientFill colors={pastelFor(item.code)} id={`dh${item.code}`} />
                <Image source={icon3d(icon3dKey({ code: item.code, icon: item.icon, name: item.name }))} style={styles.domainThumbIcon} resizeMode="contain" />
              </>
            )}
          </View>
          <View style={styles.flex}>
            <Text weight="bold" color={ink[900]} numberOfLines={1} style={styles.domainTitle} accessibilityRole="header">{item.name}</Text>
            <Text color={ink[500]} style={styles.domainCount}>
              {item.services.length} {item.services.length === 1 ? 'service' : 'services'}
            </Text>
          </View>
        </View>
        <View style={[styles.grid, { columnGap: GAP }]}>
          {item.services.map((svc) => (
            <ServiceCard key={svc.code} service={svc} domainCode={item.code} width={tile} onPress={openService} />
          ))}
        </View>
      </View>
    );
  }, [openService, tile]);

  const header = (
    <View>
      <View style={styles.hero}>
        <Text weight="bold" color={NAVY} style={styles.title} accessibilityRole="header">All Services</Text>
        <Text color={ink[500]} style={styles.subtitle}>
          {total ? `${total} services across ${all.length} areas, ready to book` : 'What we can do for you today'}
        </Text>
      </View>
      {all.length > 1 ? (
        <ScrollView ref={chipsRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" active={selected === 'all'} onPress={() => pick('all')}
            onX={(x) => { chipX.current.all = x; }} />
          {all.map((d) => (
            <Chip key={d.code} label={d.name} active={selected === d.code} onPress={() => pick(d.code)}
              icon={areaPhoto(d.code, d.imageUrl) ?? icon3d(icon3dKey({ code: d.code, icon: d.icon, name: d.name }))}
              round={Boolean(areaPhoto(d.code, d.imageUrl))}
              onX={(x) => { chipX.current[d.code] = x; if (d.code === selected) scrollToChip(d.code, false); }} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  const top = { paddingTop: insets.top + 10 };

  if (isLoading) {
    return (
      <View style={[styles.root, top]}>
        {header}
        <View style={styles.padded} accessibilityLabel="Loading services" accessibilityRole="progressbar">
          <Skeleton width="45%" height={18} style={{ marginTop: 20 }} />
          <View style={[styles.grid, { columnGap: GAP, marginTop: 14 }]}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width={tile} height={Math.round(tile * 1.18)} borderRadius={CARD_RADIUS} />)}
          </View>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.root, top]}>
        {header}
        <ErrorState message={getApiErrorMessage(error)} onRetry={refetch} style={styles.padded} />
      </View>
    );
  }

  return (
    <View style={[styles.root, top]}>
      <FlatList
        data={visible}
        keyExtractor={(d) => d.code}
        renderItem={renderDomain}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon={<PackageSearch size={28} color={BLUE} />}
            title="No services available yet"
            message="Services appear here as soon as we have verified providers for them. Nothing is bookable in your area right now."
            style={styles.padded}
          />
        }
        ListFooterComponent={visible.length ? <MoreComing onBrowseShops={() => router.push('/shops' as never)} /> : null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace }]}
        refreshing={isFetching && !isLoading}
        onRefresh={refetch}
      />
    </View>
  );
}

/**
 * One service: a white card, the photo across the top, the name beneath in a
 * fixed two-line box so every card in a row is the same height.
 */
const ServiceCard = React.memo(function ServiceCard({ service, domainCode, width, onPress }: {
  service: LiveCatalogService; domainCode: string; width: number; onPress: (s: LiveCatalogService) => void;
}) {
  const photo = servicePhoto(service.code, service.imageUrl);
  const photoH = Math.round(width * 0.78);
  return (
    <ScalePressable onPress={() => onPress(service)} style={[styles.card, { width }]} accessibilityRole="button" accessibilityLabel={service.name}>
      <View style={[styles.cardPhoto, { height: photoH }]}>
        {/* Explicit size: a bundled image's own pixel size would beat absoluteFill. */}
        {photo ? (
          <Image source={photo} style={{ width: width - 2, height: photoH }} resizeMode="cover" />
        ) : (
          <>
            <GradientFill colors={pastelFor(domainCode)} id={`sc${service.code}`} />
            <Image source={icon3d(icon3dKey({ ...service, domainCode }))} style={{ width: photoH * 0.6, height: photoH * 0.6 }} resizeMode="contain" />
          </>
        )}
      </View>
      <View style={styles.cardLabelBox}>
        <Text weight="semibold" color={ink[900]} numberOfLines={2} textBreakStrategy="simple" android_hyphenationFrequency="none"
          style={styles.cardLabel}>{service.name}</Text>
      </View>
    </ScalePressable>
  );
});

function Chip({ label, active, onPress, icon, round = false, onX }: {
  label: string; active: boolean; onPress: () => void; icon?: ReturnType<typeof icon3d>; round?: boolean; onX: (x: number) => void;
}) {
  return (
    <ScalePressable onPress={onPress} onLayout={(e) => onX(e.nativeEvent.layout.x)} accessibilityRole="tab"
      accessibilityState={{ selected: active }} accessibilityLabel={label}>
      {/* iOS 26: glass capsules, the selected one tinted brand blue. */}
      <GlassSurface interactive tint={active ? BLUE : undefined} style={styles.chip}
        fallbackStyle={[styles.chipSolid, active && styles.chipActive]}>
        {icon ? <Image source={icon} style={round ? styles.chipPhoto : styles.chipIcon} resizeMode={round ? 'cover' : 'contain'} /> : null}
        <Text weight="semibold" color={active ? '#FFFFFF' : NAVY} style={styles.chipText} numberOfLines={1}>{label}</Text>
      </GlassSurface>
    </ScalePressable>
  );
}

/** "More on the way" — a sentence, never a dead tile. */
function MoreComing({ onBrowseShops }: { onBrowseShops: () => void }) {
  return (
    <View style={styles.more}>
      <Text weight="bold" color={ink[900]} style={styles.moreTitle}>More services are on the way</Text>
      <Text color={ink[500]} style={styles.moreSub}>New services open as soon as we have verified providers for them.</Text>
      <ScalePressable onPress={onBrowseShops} accessibilityRole="button" accessibilityLabel="Browse nearby shops" hitSlop={8}>
        <View style={styles.moreCta}>
          <Text weight="bold" color={BLUE} style={styles.moreCtaText}>Browse nearby shops meanwhile</Text>
          <ArrowRight size={14} color={BLUE} />
        </View>
      </ScalePressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HOME_BG },
  flex: { flex: 1, minWidth: 0 },
  content: {},
  padded: { paddingHorizontal: PAD },
  hero: { paddingHorizontal: PAD, paddingBottom: 14 },
  title: { fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  subtitle: { fontSize: 13.5, lineHeight: 18, marginTop: 2 },

  chips: { paddingHorizontal: PAD, gap: 8, paddingBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 19 },
  chipSolid: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E9F2' },
  chipActive: { backgroundColor: BLUE, borderColor: BLUE },
  chipIcon: { width: 20, height: 20 },
  chipPhoto: { width: 24, height: 24, borderRadius: 12, marginLeft: -6 },
  chipText: { fontSize: 13, lineHeight: 17 },

  domain: { marginTop: 24, paddingHorizontal: PAD },
  domainHead: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#E6E9F2',
  },
  domainThumb: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1F8' },
  domainThumbImg: { width: 44, height: 44 },
  domainThumbIcon: { width: 30, height: 30 },
  domainTitle: { fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  domainCount: { fontSize: 12, lineHeight: 16 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: GAP },
  card: {
    borderRadius: CARD_RADIUS, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDEFF5',
    shadowColor: '#1B2A6B', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardPhoto: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderTopLeftRadius: CARD_RADIUS - 1, borderTopRightRadius: CARD_RADIUS - 1, backgroundColor: '#EEF1F8',
  },
  cardLabelBox: { height: 42, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { textAlign: 'center', fontSize: 11, lineHeight: 14, letterSpacing: -0.25 },

  more: {
    marginTop: 28, marginHorizontal: PAD, padding: 16, borderRadius: 14, alignItems: 'center',
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#D2D7DE', backgroundColor: '#FFFFFF',
  },
  moreTitle: { fontSize: 14, lineHeight: 19, textAlign: 'center' },
  moreSub: { fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 2 },
  moreCta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  moreCtaText: { fontSize: 12.5, lineHeight: 16 },
});
