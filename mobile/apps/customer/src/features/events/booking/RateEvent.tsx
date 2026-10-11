/** Rate the finished event, once (the website's review card); once given, a record of it. */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { useSubmitEventReviewMutation } from '@zappy/core/api';
import { Button, Input, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function RateEvent({ booking }: { booking: { _id: string; status: string; reviewedAt?: string; userRating?: number; userReview?: string } }) {
  const [submit, { isLoading }] = useSubmitEventReviewMutation();
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');
  if (booking.status !== 'completed') return null;
  const done = !!booking.reviewedAt;
  const shown = done ? booking.userRating || 0 : stars;

  async function send() {
    try { await submit({ id: booking._id, rating: stars, review }).unwrap(); toast.success('Thanks for the review'); }
    catch (err) { toast.error(errText(err, 'Could not save your review. Try again.')); }
  }

  return (
    <View style={styles.card}>
      <Text variant="bodySmall" weight="bold">{done ? 'Your review' : 'How was your event?'}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((i) => {
          const icon = <Star size={done ? 16 : 30} color={i <= shown ? accent[500] : slate[200]} fill={i <= shown ? accent[500] : 'transparent'} />;
          return done ? <View key={i}>{icon}</View>
            : <Pressable key={i} onPress={() => setStars(i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${i} stars`}>{icon}</Pressable>;
        })}
      </View>
      {done && booking.userReview ? <Text variant="caption" color={ink[700]}>{booking.userReview}</Text> : null}
      {!done && stars ? (
        <>
          <Input value={review} onChangeText={setReview} maxLength={1000} multiline multilineHeight={56} placeholder="Tell us about your experience (optional)" />
          <Button label="Submit review" loading={isLoading} onPress={send} fullWidth />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stars: { flexDirection: 'row', gap: spacing.sm },
});
