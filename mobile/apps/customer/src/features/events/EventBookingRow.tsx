/** One event booking in the list: cover, theme, day and slot, status, total. */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { eventDay, statusOf } from './eventStatus';
import { rupees } from './ThemeCard';

export interface EventBookingSummary {
  _id: string; status: string; eventDate?: string; eventTimeSlot?: string;
  themeId?: { title?: string; coverImage?: string }; pricing?: { totalPaise?: number };
}

export const EventBookingRow = memo(function EventBookingRow({ booking, onPress }: { booking: EventBookingSummary; onPress: () => void }) {
  const cover = webAsset(booking.themeId?.coverImage);
  const st = statusOf(booking.status);
  return (
    <Pressable onPress={onPress} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
      <View style={styles.cover}>{cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : <Text style={styles.emoji}>🎉</Text>}</View>
      <View style={styles.body}>
        <Text variant="bodySmall" weight="black" numberOfLines={1}>{booking.themeId?.title || 'Event booking'}</Text>
        <Text variant="caption" color={ink[500]}>{eventDay(booking.eventDate)}{booking.eventTimeSlot ? `, ${booking.eventTimeSlot}` : ''}</Text>
        <View style={styles.foot}>
          <Text variant="caption" weight="bold" color={st.color}>{st.label}</Text>
          <Text variant="bodySmall" weight="black">{rupees(booking.pricing?.totalPaise)}</Text>
        </View>
      </View>
      <ChevronRight size={18} color={slate[300]} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cover: { width: 64, height: 64, overflow: 'hidden', borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  emoji: { fontSize: 28 },
  body: { flex: 1, gap: 2 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
