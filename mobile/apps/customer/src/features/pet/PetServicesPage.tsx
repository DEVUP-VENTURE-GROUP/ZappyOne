/**
 * Pet Services (the website's PetServicesPage): the care categories come from
 * the server, so a category added in admin appears with no app change; the
 * icon lookup is presentation only. Quick links to pets, bookings and
 * recurring care.
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Car, ChevronRight, ClipboardCheck, Footprints, HeartHandshake, History, Home, PawPrint, Repeat, Scissors, Stethoscope, type LucideIcon } from 'lucide-react-native';
import { usePetCategoriesQuery } from '@zappy/core/api';
import { LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const ICONS: Record<string, LucideIcon> = {
  pet_grooming: Scissors, pet_boarding: Home, pet_walk: Footprints, pet_home_care: HeartHandshake,
  pet_transport: Car, pet_vet_assist: Stethoscope, pet_check: ClipboardCheck,
};
const QUICK: [string, string, LucideIcon, string][] = [
  ['pets', 'My Pets', PawPrint, '/pet/my-pets'], ['upcoming', 'Upcoming', Calendar, '/orders'],
  ['recurring', 'Recurring Care', Repeat, '/pet/recurring'], ['history', 'History', History, '/orders'],
];

export function PetServicesPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = usePetCategoriesQuery(undefined);
  const categories: { code: string; name: string; description?: string }[] = data?.categories || [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('pet.title', 'Pet Services')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text variant="bodySmall" color={ink[500]}>{t('pet.intro', 'Care for your dog or cat, from a trusted, verified provider.')}</Text>
        <View style={styles.quick}>
          {QUICK.map(([key, label, Icon, path]) => (
            <Pressable key={key} onPress={() => router.push(path as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.quickBtn}>
              <Icon size={18} color={zappy[600]} /><Text variant="caption" weight="bold" color={ink[700]} style={styles.center}>{t(`pet.quick.${key}`, label)}</Text>
            </Pressable>
          ))}
        </View>
        {isLoading ? <LoadingState /> : categories.map((c) => {
          const Icon = ICONS[c.code] || PawPrint;
          return (
            <Pressable key={c.code} onPress={() => router.push(`/pet/book/${c.code}` as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
              <View style={styles.icon}><Icon size={20} color={zappy[600]} /></View>
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="black">{c.name}</Text>
                {c.description ? <Text variant="caption" color={ink[500]}>{c.description}</Text> : null}
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
  quick: { flexDirection: 'row', gap: spacing.sm },
  quickBtn: { flex: 1, alignItems: 'center', gap: 6, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  center: { textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  icon: { width: 48, height: 48, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0 },
});
