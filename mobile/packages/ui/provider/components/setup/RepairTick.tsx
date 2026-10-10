/**
 * One job inside a heading, ticked or not, with its level, time, warranty and
 * the customers' words for it (what ticking it wins).
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '../../../components';
import { accent, colors, ink, slate, success, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { levelOf, type Repair } from './workSelection';

export const RepairTick = memo(function RepairTick({ repair, on, myLevel, onToggle }: { repair: Repair; on: boolean; myLevel: number; onToggle: (r: Repair) => void }) {
  const level = levelOf(repair);
  // Above their stated level: claimable, but it raises the level and is checked.
  const raises = level > myLevel;
  const answers = repair.answers || [];
  return (
    <Pressable onPress={() => onToggle(repair)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={repair.name} style={[styles.row, on && styles.rowOn]}>
      <View style={[styles.box, on && styles.boxOn]}>{on ? <Check size={12} color="#fff" strokeWidth={3.5} /> : null}</View>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="semibold">{repair.name}</Text>
        <View style={styles.meta}>
          <Text variant="caption" color={ink[400]}>Level {level}</Text>
          {repair.estimatedDurationMin ? <Text variant="caption" color={ink[400]}>~{repair.estimatedDurationMin} min</Text> : null}
          {repair.warrantyDays ? <Text variant="caption" color={success[600]}>{repair.warrantyDays}-day warranty</Text> : null}
          {repair.isLocal ? <Text variant="caption" weight="semibold" color="#7C3AED">Added locally</Text> : null}
          {raises ? <Text variant="caption" weight="semibold" color={accent[600]}>Raises you to level {level}</Text> : null}
        </View>
        {answers.length ? (
          <Text variant="caption" color={ink[400]}>Customers ask for this as: {answers.slice(0, 3).join(', ')}{answers.length > 3 ? ` +${answers.length - 3} more` : ''}</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  rowOn: { borderColor: zappy[500], backgroundColor: zappy[50] },
  box: { width: 20, height: 20, marginTop: 2, borderRadius: 6, borderWidth: 1, borderColor: slate[300], alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  boxOn: { backgroundColor: zappy[600], borderColor: zappy[600] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
});
