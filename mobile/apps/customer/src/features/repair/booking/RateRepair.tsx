/**
 * Rate the finished repair, once (the website's RateRepair), on the booking
 * itself with the work photos above it. Once given, the card is a record of
 * what was said.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { useRateRepairBookingMutation } from '@zappy/core/api';
import { Button, Input, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const StarRow = ({ value, size, onPick }: { value: number; size: number; onPick?: (n: number) => void }) => (
  <View style={styles.stars}>
    {[1, 2, 3, 4, 5].map((i) => {
      const icon = <Star size={size} color={i <= value ? accent[500] : slate[200]} fill={i <= value ? accent[500] : 'transparent'} />;
      return onPick ? <Pressable key={i} onPress={() => onPick(i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${i} stars`}>{icon}</Pressable> : <View key={i}>{icon}</View>;
    })}
  </View>
);

export function RateRepair({ booking }: { booking: { _id: string; status: string; ratedAt?: string; rating?: number; ratingComment?: string } }) {
  const [rate, { isLoading }] = useRateRepairBookingMutation();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  if (booking.status !== 'COMPLETED') return null;

  if (booking.ratedAt) {
    return (
      <View style={styles.card}>
        <Text variant="caption" weight="bold" color={ink[500]}>YOUR RATING</Text>
        <StarRow value={booking.rating || 0} size={16} />
        {booking.ratingComment ? <Text variant="caption" color={ink[700]}>{booking.ratingComment}</Text> : null}
      </View>
    );
  }

  async function submit() {
    try { await rate({ id: booking._id, rating: stars, comment }).unwrap(); toast.success('Thanks, that helps the next customer'); }
    catch (err) { toast.error(errText(err, 'Could not save your rating. Try again.')); }
  }

  return (
    <View style={styles.card}>
      <Text variant="bodySmall" weight="bold">How was the repair?</Text>
      <Text variant="caption" color={ink[500]}>Your rating decides who we send to the next customer.</Text>
      <StarRow value={stars} size={30} onPick={setStars} />
      {stars ? (
        <>
          <Input value={comment} onChangeText={setComment} maxLength={1000} multiline multilineHeight={56} placeholder={stars <= 3 ? 'What went wrong?' : 'Anything worth mentioning? (optional)'} />
          <Button label="Submit rating" loading={isLoading} onPress={submit} fullWidth />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stars: { flexDirection: 'row', gap: 6 },
});
