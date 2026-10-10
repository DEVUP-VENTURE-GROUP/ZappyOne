/**
 * The provider's skill level, above the work it unlocks, with one tap to tick
 * everything up to it and one to untick everything.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, Check } from 'lucide-react-native';
import { Button, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { accent, colors, ink, slate, success, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import type { SkillLevel } from './workSelection';

export function SkillLevelCard({ levels, level, required, upToCount, allUpToTicked, selectedCount, onLevel, onTickUpTo, onUntickAll }: {
  levels: SkillLevel[]; level: number; required: number; upToCount: number; allUpToTicked: boolean; selectedCount: number;
  onLevel: (l: number) => void; onTickUpTo: () => void; onUntickAll: () => void;
}) {
  const current = levels.find((l) => l.level === level);
  return (
    <View style={styles.card}>
      <Text variant="caption" weight="bold" color={ink[500]}>YOUR LEVEL</Text>
      <View style={styles.levels}>
        {levels.map((l) => {
          const below = l.level < required;
          const on = l.level === level;
          return (
            <Pressable key={l.level} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Level ${l.level}`}
              onPress={() => (below ? toast.error(`Level ${required}: you have ticked work that needs it. Untick it to come down.`) : onLevel(l.level))}
              style={[styles.level, on ? styles.levelOn : below ? styles.levelBelow : null]}>
              <Text variant="caption" weight="bold" color={on ? '#fff' : below ? slate[300] : ink[700]}>L{l.level}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" color={ink[500]}>{current?.description || 'Higher levels unlock harder work.'}</Text>
      {current?.requiresVerification ? (
        <View style={styles.warn}><AlertTriangle size={12} color={accent[600]} /><Text variant="caption" weight="semibold" color={accent[600]} style={styles.flex}>This level is verified before those jobs start reaching you.</Text></View>
      ) : null}
      {allUpToTicked ? (
        <View style={styles.allDone}><Check size={14} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>All {upToCount} jobs up to level {level} ticked</Text></View>
      ) : (
        <Button label={`Tick all ${upToCount} jobs up to level ${level}`} onPress={onTickUpTo} fullWidth />
      )}
      {selectedCount > 0 ? <Button label={`Untick all ${selectedCount} jobs`} variant="outline" onPress={onUntickAll} fullWidth /> : null}
      <Text variant="caption" color={ink[500]} style={styles.center}>Tap the box on a heading to tick or untick all of it, or open it to choose job by job.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  levels: { flexDirection: 'row', gap: 6 },
  level: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium, backgroundColor: slate[100] },
  levelOn: { backgroundColor: zappy[600] },
  levelBelow: { backgroundColor: slate[50] },
  warn: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  allDone: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.button, backgroundColor: success[50] },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
});
