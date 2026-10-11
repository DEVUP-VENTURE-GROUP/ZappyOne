/** A shop's public page (the website's ShopPublicProfilePage): who they are, where, and each live service they are verified for, one tap to book it. */
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Calendar, ChevronRight, MapPin, ShieldCheck, Star, Store } from 'lucide-react-native';
import { useGetShopProfileQuery } from '@zappy/core/api';
import { EmptyState, LoadingState, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function ShopPublicProfilePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useGetShopProfileQuery(id);
  const shop = data?.shop;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/nearby-shops' as never));

  if (isLoading) return <LoadingState />;
  if (!shop) return <View style={styles.page}><EmptyState icon={<Store size={32} color={slate[300]} />} title={t('shops.notFound', 'Shop not found')} actionLabel={t('shops.browse', 'Browse other shops')} onAction={() => router.replace('/nearby-shops' as never)} /></View>;
  const cover = webAsset(shop.coverImageUrl);
  const services: { code: string; name: string; path: string }[] = shop.services || [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
      <View style={styles.hero}>
        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : <Store size={40} color={zappy[300]} />}
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={[styles.back, { top: insets.top + spacing.sm }]}><ArrowLeft size={18} color={ink[900]} /></Pressable>
      </View>
      <View style={styles.body}>
        <View style={[styles.card, styles.lift]}>
          <View style={styles.inline}><Text variant="heading3" weight="black" style={styles.shrink}>{shop.businessName}</Text><ShieldCheck size={17} color={success[500]} /></View>
          <Text variant="caption" color={ink[400]}>{shop.category || t('shops.local', 'Local Repair Shop')}</Text>
          <View style={styles.meta}>
            {shop.rating > 0 ? <View style={styles.inline}><Star size={14} color={accent[500]} fill={accent[500]} /><Text variant="bodySmall" weight="bold" color={ink[700]}>{shop.rating.toFixed(1)}</Text>{shop.reviewCount ? <Text variant="caption" color={ink[400]}>({shop.reviewCount})</Text> : null}</View> : null}
            {shop.completedJobs > 0 ? <Text variant="caption" color={ink[400]}>{shop.completedJobs} {t('shops.completed', 'jobs completed')}</Text> : null}
            {shop.yearsActive > 0 ? <View style={styles.inline}><Calendar size={11} color={ink[400]} /><Text variant="caption" color={ink[400]}>{shop.yearsActive}+ yrs</Text></View> : null}
          </View>
        </View>
        {shop.bio ? <View style={styles.card}><Text variant="bodySmall" color={ink[700]}>{shop.bio}</Text></View> : null}
        {shop.address?.text ? (
          <View style={[styles.card, styles.row]}>
            <MapPin size={15} color={zappy[500]} />
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold">{shop.address.text}</Text>
              {shop.address.landmark ? <Text variant="caption" color={ink[400]}>{t('shops.near', 'Near')} {shop.address.landmark}</Text> : null}
            </View>
          </View>
        ) : null}
        <Text variant="caption" weight="bold" color={ink[500]}>{t('shops.verifiedFor', 'VERIFIED FOR')}</Text>
        {!services.length ? <Text variant="caption" color={ink[400]}>{t('shops.noServices', 'This shop is not verified for any live service yet.')}</Text> : services.map((s) => (
          <Pressable key={s.code} onPress={() => router.push(s.path as never)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.card, styles.row]}>
            <Text variant="bodySmall" weight="semibold" style={styles.flex}>{s.name}</Text>
            <ChevronRight size={16} color={slate[300]} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  hero: { height: 208, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[100] },
  back: { position: 'absolute', left: spacing.base, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  body: { gap: spacing.md, paddingHorizontal: spacing.base },
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  lift: { marginTop: -32 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shrink: { flexShrink: 1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.base, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
});
