/**
 * Which engine this exact car has, read from the model (the website's FuelStep):
 * it decides which symptoms are asked next.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { ink } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Coded } from './BrandStep';
import { Shell, flow } from './FlowChrome';

/** Which engine this exact car has, read from the model; it decides which symptoms are asked next. */
export function FuelStep({ model, fuels, onPick }: { model: Coded | null; fuels: Coded[]; onPick: (f: Coded) => void }) {
  return (
    <Shell>
      <Text variant="caption" color={ink[500]} style={flow.label}>{model?.name} is sold with more than one engine. Which one is yours?</Text>
      <View style={styles.grid2}>
        {fuels.map((f) => (
          <Pressable key={f.code} onPress={() => onPick(f)} android_ripple={RIPPLE} accessibilityRole="button" style={[flow.card, styles.half]}>
            <Text variant="bodySmall" weight="bold">{f.name}</Text>
          </Pressable>
        ))}
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  half: { width: '48.5%' },
});
