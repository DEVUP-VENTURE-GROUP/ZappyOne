/** "Available from 8:00 AM": when the pros who cover the area are offline (the website's ClosedNowBanner). */
import { StyleSheet, View } from 'react-native';
import { Moon } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { accent } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function to12h(hhmm: string) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export interface NextOpening { daysAhead: number; day: number; opensAt: string }

/** From real provider hours; "back soon" when hours are unknown. */
export function nextOpeningLabel(next?: NextOpening | null) {
  if (!next) return 'Providers near you will be back soon';
  const when = next.daysAhead === 0 ? '' : next.daysAhead === 1 ? ' tomorrow' : ` on ${DAYS[next.day]}`;
  return `Available${when} from ${to12h(next.opensAt)}`;
}

export function ClosedNowBanner({ nextOpening }: { nextOpening?: NextOpening | null }) {
  return (
    <View style={styles.banner} accessibilityRole="summary">
      <Moon size={18} color={accent[700]} />
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="semibold" color={accent[700]}>{nextOpeningLabel(nextOpening)}</Text>
        <Text variant="caption" color={accent[700]}>The pros who cover your area are offline right now. You can still browse and schedule.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderRadius: radius.medium, borderLeftWidth: 4, borderLeftColor: accent[500], backgroundColor: accent[50] },
  flex: { flex: 1, gap: 2 },
});
