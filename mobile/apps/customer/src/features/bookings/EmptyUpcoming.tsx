/** Nothing in flight (the website's EmptyUpcoming): a way into the services, and the last few things booked, one tap to book again. */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Calendar, type LucideIcon } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Suggestion { href: string; label: string; labelKey: string; Icon: LucideIcon }

export function EmptyUpcoming({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const t = useT();
  return (
    <View style={styles.gap}>
      <Pressable onPress={() => router.push('/services' as never)} accessibilityRole="button" style={styles.card}>
        <View style={styles.flex}>
          <Text variant="body" weight="bold">{t('activity.noUpcoming', 'No upcoming bookings')}</Text>
          <Text variant="bodySmall" color={ink[500]}>{t('activity.bookInMinute', 'Book a service in under a minute.')}</Text>
          <View style={styles.inline}><Text variant="bodySmall" weight="semibold" color={zappy[600]}>{t('activity.browse', 'Browse services')}</Text><ArrowRight size={14} color={zappy[600]} /></View>
        </View>
        <View style={styles.icon}><Calendar size={26} color={zappy[500]} /></View>
      </Pressable>
      {suggestions.length ? (
        <View style={styles.gap}>
          <Text variant="caption" weight="bold" color={ink[400]}>{t('activity.bookAgain', 'Book again').toUpperCase()}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {suggestions.map(({ href, label, labelKey, Icon }) => (
              <Pressable key={href} onPress={() => router.push(href as never)} accessibilityRole="button" style={styles.chip}>
                <View style={styles.chipIcon}><Icon size={14} color={ink[500]} /></View>
                <Text variant="caption" weight="bold" style={styles.cap}>{t(labelKey, label)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: slate[50] },
  flex: { flex: 1, gap: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  icon: { width: 56, height: 56, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  chips: { gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 6, paddingRight: 14, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  cap: { textTransform: 'capitalize' },
});
