/**
 * Nearby shops (the website's NearbyShopsPage): shops near the customer that
 * ZappyOne verified for each service they offer, filterable by the services
 * some shop nearby actually has, open or closed said plainly.
 */
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, MapPin, SearchX, ShieldCheck, Star, Store } from 'lucide-react-native';
import { useNearbyShopsQuery } from '@zappy/core/api';
import { loadGeoLocation, type CachedLocation } from '@zappy/core/lib/geoCache';
import { Chip, EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Shop { _id: string; businessName: string; coverImageUrl?: string; services?: { name: string }[]; category?: string; rating?: number; completedJobs?: number; openNow?: boolean | null; todayHours?: { closesAt?: string } }

export function NearbyShopsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [loc, setLoc] = useState<CachedLocation | null | undefined>(undefined);
  const [service, setService] = useState('');
  useEffect(() => { loadGeoLocation().then(setLoc); }, []);
  const { data, isLoading, isFetching } = useNearbyShopsQuery({ lat: loc?.lat, lng: loc?.lng, service: service || undefined, radiusKm: 15 }, { skip: !loc });
  const shops: Shop[] = useMemo(() => data?.shops || [], [data]);
  const filters = useMemo(() => [{ code: '', name: t('activity.filter.all', 'All') }, ...(data?.services || [])], [data, t]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('shops.title', 'Nearby Shops')} subtitle={t('shops.sub', 'Trusted local businesses')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.note}><Text variant="caption" weight="medium" color={zappy[700]}>{t('shops.intro', 'Shops near you that ZappyOne has verified for each service they offer. Open one to book it.')}</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {filters.map(({ code, name }: { code: string; name: string }) => <Chip key={code || 'all'} label={name} selected={service === code} onPress={() => setService(code)} />)}
        </ScrollView>
        {loc === undefined || (loc && isLoading) ? <LoadingState /> : !loc ? (
          <EmptyState icon={<MapPin size={28} color={slate[300]} />} title={t('shops.needLoc', 'Set your location')} message={t('shops.needLocHint', 'Choose your location on the home screen to find shops near you.')} actionLabel={t('soon.home', 'Go to home')} onAction={() => router.replace('/' as never)} />
        ) : !shops.length ? (
          <EmptyState icon={<SearchX size={28} color={slate[300]} />} title={t('shops.none', 'No shops found nearby')} message={t('shops.noneHint', 'You can still book any service from the home screen. We find a verified provider for you.')} />
        ) : (
          <View style={[styles.list, isFetching && styles.dim]}>
            {shops.map((s) => {
              const cover = webAsset(s.coverImageUrl);
              return (
                <Pressable key={s._id} onPress={() => router.push(`/shops/${s._id}` as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
                  <View style={styles.cover}>{cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : <Store size={22} color={slate[300]} />}</View>
                  <View style={styles.flex}>
                    <View style={styles.inline}><Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.shrink}>{s.businessName}</Text><ShieldCheck size={13} color={success[500]} /></View>
                    <Text variant="caption" color={ink[400]} numberOfLines={1}>{(s.services || []).map((x) => x.name).join(' · ') || s.category}</Text>
                    <View style={styles.meta}>
                      {s.rating ? <View style={styles.inline}><Star size={11} color={accent[500]} fill={accent[500]} /><Text variant="caption" weight="bold" color={ink[700]}>{s.rating.toFixed(1)}</Text></View> : null}
                      {s.completedJobs ? <Text variant="caption" color={ink[400]}>{s.completedJobs} {t('shops.jobs', 'jobs done')}</Text> : null}
                      {s.openNow === true ? <Text variant="caption" weight="bold" color={success[600]}>{t('shops.open', 'Open now')}{s.todayHours?.closesAt ? ` · till ${s.todayHours.closesAt}` : ''}</Text> : null}
                      {s.openNow === false ? <Text variant="caption" weight="bold" color={ink[400]}>{t('shops.closed', 'Closed now')}</Text> : null}
                    </View>
                  </View>
                  <ChevronRight size={16} color={slate[300]} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  note: { padding: spacing.md, borderRadius: radius.large, backgroundColor: zappy[50] },
  chips: { gap: spacing.sm },
  list: { gap: spacing.md },
  dim: { opacity: 0.6 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cover: { width: 64, height: 64, borderRadius: radius.medium, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shrink: { flexShrink: 1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2, marginTop: 2 },
});
