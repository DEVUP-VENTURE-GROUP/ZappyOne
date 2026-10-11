/** Where the booking is: payment, confirmed, team assigned, setting up, done. */
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { EVENT_TIMELINE } from '../eventStatus';

export function EventTimeline({ step }: { step: number }) {
  return (
    <View style={styles.card}>
      {EVENT_TIMELINE.map((label, i) => {
        const done = i < step;
        const now = i === step;
        return (
          <View key={label} style={styles.step}>
            <View style={[styles.dot, done && styles.done, now && styles.now]}>
              {done ? <Check size={14} color="#fff" /> : <Text variant="caption" weight="bold" color={now ? '#fff' : ink[400]}>{i + 1}</Text>}
            </View>
            <Text variant="caption" weight="semibold" color={now ? zappy[600] : done ? success[700] : ink[400]} style={styles.label}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  done: { backgroundColor: success[500] },
  now: { backgroundColor: zappy[600] },
  label: { textAlign: 'center', fontSize: 10 },
});
