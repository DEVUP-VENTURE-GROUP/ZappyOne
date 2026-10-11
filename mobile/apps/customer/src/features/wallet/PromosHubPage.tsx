/** Promo codes (the website's PromosHubPage): every active offer, those still usable first. */
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tag } from 'lucide-react-native';
import { useGetAvailablePromosQuery } from '@zappy/core/api';
import { EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PromoCard, type Promo } from './PromoCard';

export function PromosHubPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useGetAvailablePromosQuery(undefined);
  const promos: Promo[] = data?.promos ?? [];
  const available = promos.filter((p) => !p.alreadyUsed);
  const used = promos.filter((p) => p.alreadyUsed);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('profile.promos', 'Promo Codes')} onBack={back}
        right={available.length ? <View style={styles.count}><Text variant="caption" weight="medium" color="#fff">{available.length} {t('promo.available', 'available')}</Text></View> : null} />
      {isLoading ? <LoadingState /> : !promos.length ? (
        <EmptyState icon={<Tag size={36} color={slate[300]} />} title={t('promo.none', 'No active promos right now')} message={t('promo.noneHint', 'Check back soon for offers and discounts')} />
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          {available.map((p) => <PromoCard key={p.code} promo={p} />)}
          {used.length ? <Text variant="caption" weight="medium" color={ink[400]} style={styles.label}>{t('promo.alreadyUsed', 'Already used')}</Text> : null}
          {used.map((p) => <PromoCard key={p.code} promo={p} />)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  count: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: zappy[600] },
  label: { paddingTop: spacing.sm },
});
