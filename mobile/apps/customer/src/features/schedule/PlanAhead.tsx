/** Book something for later (the website's PlanAhead): the services that take a day and time, one tap to start. Links the app has no screen for yet are left out. */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PartyPopper, PawPrint, ShoppingBag, Smartphone, type LucideIcon } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { isBuilt } from '../../../routes';

const PLAN: [string, string, LucideIcon][] = [['/repair', 'Phone repair', Smartphone], ['/pet', 'Pet care', PawPrint], ['/helping', 'Errands', ShoppingBag], ['/events', 'Event décor', PartyPopper]];

export function PlanAhead() {
  const router = useRouter();
  const t = useT();
  const shown = PLAN.filter(([href]) => isBuilt(href));
  return (
    <View style={styles.card}>
      <Text variant="bodySmall" weight="bold">{t('schedule.later', 'Book something for later')}</Text>
      <Text variant="caption" color={ink[500]}>{t('schedule.laterHint', 'Choose a day and time when you book. It shows up here.')}</Text>
      <View style={styles.grid}>
        {shown.map(([href, label, Icon]) => (
          <Pressable key={href} onPress={() => router.push(href as never)} accessibilityRole="button" style={styles.tile}>
            <View style={styles.icon}><Icon size={18} color={zappy[600]} /></View>
            <Text variant="caption" weight="semibold" color={ink[700]} style={styles.center}>{t(`schedule.plan.${href}`, label)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: spacing.base, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  grid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  tile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: spacing.md, paddingHorizontal: 4, borderRadius: radius.large, backgroundColor: slate[50] },
  icon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  center: { textAlign: 'center' },
});
