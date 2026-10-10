/** "How was your experience?" in the bottom bar right after completion, before the job is rated (the website's RatingPanel). */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { Button, Text } from '@zappy/ui/components';
import { accent, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function RatingPanel({ onRate }: { onRate: (stars: number) => void }) {
  const [value, setValue] = useState(0);
  return (
    <View style={styles.panel}>
      <Text variant="bodySmall" weight="bold" color="#fff" style={styles.center}>How was your experience?</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setValue(n)} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} hitSlop={4}>
            <Star size={32} strokeWidth={1.5} color={n <= value ? accent[500] : 'rgba(255,255,255,0.25)'} fill={n <= value ? accent[500] : 'transparent'} />
          </Pressable>
        ))}
      </View>
      <Button label="Submit rating" variant="success" disabled={!value} onPress={() => onRate(value)} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, backgroundColor: ink[900] },
  center: { textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
});
