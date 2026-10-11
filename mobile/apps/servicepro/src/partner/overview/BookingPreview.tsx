/** A few bookings of one kind on the home, with the way to all of them. */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PartnerBookingRow, type PartnerBooking } from '../PartnerBookingRow';

export function BookingPreview({ title, empty, rows = [], filter }: { title: string; empty: string; rows?: PartnerBooking[]; filter: string }) {
  const router = useRouter();
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text variant="body" weight="bold">{title}</Text>
        <Pressable onPress={() => router.push(`/partner/bookings?status=${filter}` as never)} accessibilityRole="button" hitSlop={8} style={styles.link}>
          <Text variant="caption" weight="bold" color={zappy[600]}>See all</Text><ArrowRight size={14} color={zappy[600]} />
        </Pressable>
      </View>
      {rows.length ? rows.slice(0, 4).map((b) => <PartnerBookingRow key={b._id} booking={b} showNet={false} />)
        : <Text variant="bodySmall" color={ink[500]}>{empty}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
