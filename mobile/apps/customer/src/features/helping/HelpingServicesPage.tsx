/**
 * Family Assist (the website's HelpingServicesPage): every live errand and home-help service from the catalog in one list; before the catalog groups them, the two built-in errand cards stand in.
 */
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, PackageCheck, ShoppingBasket, type LucideIcon } from 'lucide-react-native';
import { useHelpingServicesQuery, useLiveCatalogQuery } from '@zappy/core/api';
import { servicePhoto } from '@zappy/core/shared/problemArt';
import { EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Card { code: string; name: string; tagline: string; Icon: LucideIcon; path: string; type?: string }
interface CatalogService { code: string; name: string; tagline?: string; description?: string; icon?: string; path: string }

const FALLBACK: Card[] = [
  { code: 'shopping_pickup', name: 'Shopping & Pickup', tagline: 'Buy items from a shop, or collect a pickup, with a receipt and photos at every step', Icon: ShoppingBasket, path: '/helping/shopping', type: 'shopping' },
  { code: 'returns_exchange', name: 'Returns & Exchange', tagline: 'We handle the trip to the store or courier. The merchant decides, not us', Icon: PackageCheck, path: '/helping/returns', type: 'return' },
];

export function HelpingServicesPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data: catalog, isLoading } = useLiveCatalogQuery(undefined);
  const { data: helping } = useHelpingServicesQuery(undefined);
  const domain = (catalog?.domains || []).find((d: { code: string }) => d.code === 'family_assist') as { name?: string; services?: CatalogService[] } | undefined;
  const live = new Set((helping?.services || []).map((s: { serviceType: string }) => s.serviceType));
  const cards: Card[] = domain?.services?.length
    ? domain.services.map((s) => ({ code: s.code, name: s.name, tagline: s.tagline || s.description || '', Icon: serviceIcon(s.icon), path: s.path }))
    : FALLBACK.filter((c) => (c.type === 'shopping' ? live.has('shopping') || live.has('pickup') : live.has('return')));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={domain?.name || t('help.title', 'Family Assist')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text variant="bodySmall" color={ink[500]}>{t('help.intro2', 'Errands, elder visits and help at home, by ZappyOne staff and verified helpers. You see the price before you book.')}</Text>
        {isLoading ? <LoadingState /> : !cards.length ? <EmptyState title={t('help.notHere', 'Not available in your area yet.')} /> : cards.map((c) => {
          const photo = webAsset(servicePhoto(c.code));
          return (
            <Pressable key={c.code} onPress={() => router.push(c.path as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
              {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <View style={styles.icon}><c.Icon size={22} color={zappy[600]} /></View>}
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="black">{c.name}</Text>
                {c.tagline ? <Text variant="caption" color={ink[500]}>{c.tagline}</Text> : null}
              </View>
              <ChevronRight size={18} color={slate[300]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  photo: { width: 56, height: 56, borderRadius: radius.large },
  icon: { width: 48, height: 48, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0 },
});
