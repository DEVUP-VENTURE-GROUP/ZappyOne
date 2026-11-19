// After a job is done the customer rates it before going on: one sheet that stays until a star is given (the website's RateLastJob).
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { useAppSelector } from '@zappy/core/store/hooks';
import { useRateLastJob } from '@zappy/core/shared/useRateLastJob';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function RateLastJob() {
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const { job, rate, saving } = useRateLastJob({ skip: !signedIn });
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  if (!signedIn || !job) return null;

  async function send() {
    try { await rate(stars, comment.trim()); toast.success('Thanks. Your rating helps the next customer.'); setStars(0); setComment(''); }
    catch (err) { toast.error(errText(err, 'Could not save your rating. Try again.')); }
  }
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text variant="caption" weight="bold" color={ink[400]}>JOB DONE</Text>
          <Text variant="heading3" weight="extrabold">How was your {job.title}?</Text>
          <Text variant="bodySmall" color={ink[500]}>Rate it to continue. Booking {job.reference}.</Text>
          <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setStars(n)} accessibilityRole="radio" accessibilityState={{ checked: stars === n }} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} hitSlop={6}>
                <Star size={36} color={n <= stars ? accent[500] : slate[200]} fill={n <= stars ? accent[500] : 'transparent'} />
              </Pressable>
            ))}
          </View>
          {stars > 0 && stars < 4 ? (
            <TextInput value={comment} onChangeText={setComment} maxLength={300} placeholder="What went wrong? (optional)" placeholderTextColor={ink[400]} multiline style={styles.input} />
          ) : null}
          <Button label="Submit rating" onPress={send} loading={saving} disabled={!stars} fullWidth size="large" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.5)' },
  sheet: { gap: spacing.sm, padding: spacing.lg, borderTopLeftRadius: radius.extraLarge, borderTopRightRadius: radius.extraLarge, backgroundColor: colors.surface },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginVertical: spacing.md },
  input: { minHeight: 64, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200], color: ink[900], textAlignVertical: 'top' },
});
