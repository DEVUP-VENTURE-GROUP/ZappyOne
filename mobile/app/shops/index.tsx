/**
 * Nearby Shops — verified local repair shops the customer can browse instead
 * of (or alongside) ordinary Zappy Express dispatch. Mirrors
 * client/src/pages/NearbyShopsPage.jsx against the same `/shops/nearby` API.
 */

import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { ChevronRight, MapPin, SearchX, ShieldCheck, Star, Store } from 'lucide-react-native';
import {
  Card, Chip, EmptyState, ErrorState, ScalePressable, SkeletonList, Text,
} from '../../components/ui';
import { SupportHeader } from '../../components/support/SupportHeader';
import { useNearbyShopsQuery } from '../../services/api/shopApi';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';

const CATEGORY_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'screen_replacement', label: 'Phone Screen' },
  { key: 'battery_replacement', label: 'Phone Battery' },
  { key: 'laptop_screen_issue', label: 'Laptop Screen' },
  { key: 'laptop_motherboard_issue', label: 'Laptop Repair' },
  { key: 'smart_tv_repair', label: 'Smart TV' },
  { key: 'cctv_install', label: 'CCTV' },
];

export default function NearbyShopsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [service, setService] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== Location.PermissionStatus.GRANTED) {
          if (!cancelled) setLocationDenied(true);
          return;
        }
        const position = await Location.getCurrentPositionAsync({});
        if (!cancelled) {
          setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        }
      } catch {
        if (!cancelled) setLocationDenied(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { data: shops = [], isLoading, isFetching, error, refetch } = useNearbyShopsQuery(
    coords ? { lat: coords.lat, lng: coords.lng, service: service || undefined, radiusKm: 15 } : ({} as never),
    { skip: !coords },
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <SupportHeader title="Nearby Shops" icon={Store} iconColor="#818CF8" onBack={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Card variant="flat" style={styles.introCard}>
          <Text variant="bodySmall" color={colors.textSecondary}>
            Verified local shops for repairs & services. Have their worker visit you, or walk in yourself with{' '}
            <Text variant="bodySmall" weight="bold" color={colors.primaryDark}>Pick & Go</Text>.
          </Text>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
          {CATEGORY_FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} selected={service === f.key} onPress={() => setService(f.key)} />
          ))}
        </ScrollView>

        {locationDenied ? (
          <EmptyState
            title="Enable location"
            message="We need your location to find shops near you."
            icon={<MapPin size={28} color={colors.textMuted} />}
          />
        ) : !coords || isLoading ? (
          <SkeletonList count={4} />
        ) : error ? (
          <ErrorState message="We couldn't load nearby shops." onRetry={refetch} />
        ) : shops.length === 0 ? (
          <EmptyState
            title="No shops found nearby"
            message="Try Zappy Express instead, or check back later."
            icon={<SearchX size={28} color={colors.textMuted} />}
          />
        ) : (
          <View style={[styles.list, isFetching ? styles.fetching : null]}>
            {shops.map((s) => (
              <ScalePressable
                key={s._id}
                onPress={() => router.push(`/shops/${s._id}` as never)}
                accessibilityRole="button"
                accessibilityLabel={`${s.businessName}, view shop`}
              >
                <Card>
                  <View style={styles.shopRow}>
                    <View style={styles.shopThumb}>
                      {s.coverImageUrl ? (
                        <Image source={{ uri: s.coverImageUrl }} style={styles.shopThumbImg} resizeMode="cover" />
                      ) : (
                        <Store size={22} color={colors.textMuted} />
                      )}
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.shopNameRow}>
                        <Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.flex}>
                          {s.businessName}
                        </Text>
                        <ShieldCheck size={13} color={colors.success} />
                      </View>
                      <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                        {s.category || 'Local Repair Shop'}
                      </Text>
                      <View style={styles.statsRow}>
                        {s.rating ? (
                          <View style={styles.statPill}>
                            <Star size={11} color="#F59E0B" fill="#F59E0B" />
                            <Text variant="caption" weight="semibold">{s.rating.toFixed(1)}</Text>
                          </View>
                        ) : null}
                        {s.completedJobs ? (
                          <Text variant="caption" color={colors.textMuted}>{s.completedJobs} jobs done</Text>
                        ) : null}
                      </View>
                    </View>
                    <ChevronRight size={16} color={colors.textMuted} />
                  </View>
                </Card>
              </ScalePressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: screenPadding, paddingTop: spacing.md, gap: spacing.md },
  introCard: { backgroundColor: '#EEF2FF' },
  filterRow: { marginHorizontal: -screenPadding },
  filterRowContent: { paddingHorizontal: screenPadding, gap: spacing.sm },
  list: { gap: spacing.sm },
  fetching: { opacity: 0.6 },
  flex: { flex: 1 },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  shopThumb: {
    width: 56, height: 56, borderRadius: radius.medium, backgroundColor: colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  shopThumbImg: { width: '100%', height: '100%' },
  shopNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
