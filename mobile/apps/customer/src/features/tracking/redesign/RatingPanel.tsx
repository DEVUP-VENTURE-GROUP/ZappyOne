import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { Button, Text } from '@zappy/ui/components';
import { accent, colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

// Five stars and one button where the job ends (the website's RatingPanel).
export function RatingPanel({ onRate, name }: { onRate: (stars: number) => void; name?: string | null }) {
  const [value, setValue] = useState(0);
  return (
    <View style={styles.panel}>
      <Text variant="body" weight="bold" style={styles.center}>How was {name || 'the service'}?</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setValue(n)} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} hitSlop={4}>
            <Star size={32} strokeWidth={1.5} color={n <= value ? accent[500] : ink[300]} fill={n <= value ? accent[500] : 'transparent'} />
          </Pressable>
        ))}
      </View>
      <Button label="Submit rating" disabled={!value} onPress={() => onRate(value)} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  center: { textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
});
