/**
 * Above "Choose who" (the website's BasketBar): book more in the same visit.
 * "+ Add another vehicle" (any kind we do), and "Also add…" suggestions for the
 * same one, learned from what customers book together (server repair/services/suggest).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Plus, Sparkles } from 'lucide-react-native';
import { useRepairSuggestionsQuery } from '@zappy/core/api';
import { ADD_TARGETS, thingOf } from '@zappy/core/shared/repairBasket';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { flow } from '../flow/FlowChrome';

interface Suggestion { vertical: string; repairCode: string; name: string }
type Target = (typeof ADD_TARGETS)[number];

export function BasketBar({ vertical, current, count, onAddAnother, onAddSuggestion }: {
  vertical: string; current: { repairCode: string } | null; count: number; onAddAnother: (t: Target) => void; onAddSuggestion: (s: Suggestion) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const { data } = useRepairSuggestionsQuery({ vertical, repairCode: current?.repairCode }, { skip: !current?.repairCode });
  const sameKind: Suggestion[] = (data?.suggestions || []).filter((s: Suggestion) => s.vertical === vertical);
  if (!current) return null;
  return (
    <View style={flow.card}>
      {count > 0 ? <Text variant="caption" weight="bold" color={zappy[700]}>{count + 1} items in this visit, one visit fee</Text> : null}
      {sameKind.length ? (
        <View style={styles.gap}>
          <View style={styles.row}><Sparkles size={12} color={ink[500]} /><Text variant="caption" weight="bold" color={ink[500]}>ALSO ADD FOR THIS {thingOf(vertical).toUpperCase()}</Text></View>
          <View style={styles.wrap}>
            {sameKind.map((s) => (
              <Pressable key={s.repairCode} onPress={() => onAddSuggestion(s)} accessibilityRole="button" style={styles.chip}>
                <Text variant="caption" weight="semibold" color={zappy[700]}>+ {s.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {!choosing ? (
        <Pressable onPress={() => setChoosing(true)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.add}>
          <Plus size={16} color={ink[700]} /><Text variant="bodySmall" weight="bold" color={ink[700]}>Add another {thingOf(vertical)} to this visit</Text>
        </Pressable>
      ) : (
        <View style={styles.gap}>
          <Text variant="caption" weight="semibold" color={ink[500]}>What else should we look at?</Text>
          <View style={styles.wrap}>
            {ADD_TARGETS.map((t) => (
              <Pressable key={t.vertical} onPress={() => onAddAnother(t)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.target}>
                <Text variant="bodySmall" weight="bold">{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: zappy[200], backgroundColor: zappy[50] },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderStyle: 'dashed', borderColor: slate[300] },
  target: { flexBasis: '47%', flexGrow: 1, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border },
});
