/**
 * Helping Services (the website's HelpingServicesPage): two cards, shown only
 * when the server has that service configured, so there is never a link to a
 * screen that cannot price itself.
 */
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, PackageCheck, ShoppingBasket, type LucideIcon } from 'lucide-react-native';
import { useHelpingServicesQuery } from '@zappy/core/api';
import { servicePhoto } from '@zappy/core/shared/problemArt';
import { EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const CARDS: { key: 'shopping' | 'return'; title: string; subtitle: string; Icon: LucideIcon; path: string }[] = [
  { key: 'shopping', title: 'Shopping & Pickup', subtitle: 'Buy items from a shop, or collect a pickup, with a receipt and photos at every step', Icon: ShoppingBasket, path: '/helping/shopping' },
  { key: 'return', title: 'Returns & Exchange', subtitle: "We handle the trip to the store or courier. The merchant decides, not us", Icon: PackageCheck, path: '/helping/returns' },
];

export function HelpingServicesPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useHelpingServicesQuery(undefined);
  const live = new Set((data?.services || []).map((s: { serviceType: string }) => s.serviceType));
  const shown = CARDS.filter((c) => (c.key === 'shopping' ? live.has('shopping') || live.has('pickup') : live.has('return')));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('help.title', 'Helping Services')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text variant="bodySmall" color={ink[500]}>{t('help.intro', "A trusted person to physically do a small real-world task you can't or don't want to do yourself.")}</Text>
        {isLoading ? <LoadingState /> : !shown.length ? <EmptyState title={t('help.notHere', 'Not available in your area yet.')} /> : shown.map((c) => {
          const photo = webAsset(servicePhoto(c.key));
          return (
            <Pressable key={c.key} onPress={() => router.push(c.path as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
              {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <View style={styles.icon}><c.Icon size={22} color={zappy[600]} /></View>}
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="black">{t(`help.card.${c.key}`, c.title)}</Text>
                <Text variant="caption" color={ink[500]}>{t(`help.card.${c.key}.sub`, c.subtitle)}</Text>
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
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.lg, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  photo: { width: 64, height: 64, borderRadius: radius.large },
  icon: { width: 48, height: 48, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0 },
});
