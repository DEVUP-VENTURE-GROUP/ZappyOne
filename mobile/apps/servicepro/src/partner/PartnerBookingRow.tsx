/** One booking in a partner's list: the day, the package, where, guests, state and what they keep. */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Users } from 'lucide-react-native';
import { partnerNetPaise } from '@zappy/core/shared/partnerBookings';
import { placeName } from '@zappy/core/shared/telanganaPlaces';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PartnerStatusChip } from './PartnerStatusChip';

export interface PartnerBooking {
  _id: string; status: string; eventDate: string; eventTimeSlot?: string; guestCount?: number;
  themeId?: { title?: string; coverImage?: string; setupDurationMinutes?: number }; address?: { line1?: string; city?: string; pincode?: string; lat?: number; lng?: number };
  pricing?: { totalPaise?: number; platformCommissionPct?: number }; payout?: { netPaise?: number; commissionPct?: number };
}

const shortDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export const PartnerBookingRow = memo(function PartnerBookingRow({ booking: b, showNet = true }: { booking: PartnerBooking; showNet?: boolean }) {
  const router = useRouter();
  const day = new Date(b.eventDate);
  return (
    <Pressable onPress={() => router.push(`/partner/bookings/${b._id}` as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
      <View style={styles.date}>
        <Text variant="caption" weight="bold" color={zappy[600]}>{day.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</Text>
        <Text variant="heading3" weight="black">{day.getDate()}</Text>
      </View>
      <View style={styles.body}>
        <Text variant="bodySmall" weight="bold" numberOfLines={1}>{b.themeId?.title || 'Event'}</Text>
        <Text variant="caption" color={ink[500]} numberOfLines={1}>{shortDate(b.eventDate)}{b.eventTimeSlot ? `, ${b.eventTimeSlot}` : ''}, {placeName(b.address?.city) || 'Location on booking'}</Text>
        <View style={styles.meta}>
          <PartnerStatusChip status={b.status} />
          <View style={styles.guests}><Users size={12} color={ink[400]} /><Text variant="caption" color={ink[500]}>{b.guestCount || 1}</Text></View>
          {showNet ? <Text variant="caption" weight="bold" color={success[700]}>You get {formatPaise(partnerNetPaise(b))}</Text> : null}
        </View>
      </View>
      <ChevronRight size={18} color={slate[300]} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  date: { width: 52, alignItems: 'center', paddingVertical: 6, borderRadius: radius.medium, backgroundColor: zappy[50] },
  body: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  guests: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
