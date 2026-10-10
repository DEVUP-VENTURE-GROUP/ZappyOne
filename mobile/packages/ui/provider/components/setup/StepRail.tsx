/** Progress through the setup: each step, done or not, and a tap to jump to it. */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '../../../components';
import { colors, ink, slate, success, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import type { SetupStep, StepDef } from './setupFlow';

export function StepRail({ steps, current, done, onJump }: { steps: StepDef[]; current: SetupStep; done: Set<SetupStep>; onJump: (s: SetupStep) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {steps.map((s, i) => {
        const isDone = done.has(s.key);
        const isCurrent = s.key === current;
        return (
          <Pressable key={s.key} onPress={() => onJump(s.key)} accessibilityRole="tab" accessibilityState={{ selected: isCurrent }} accessibilityLabel={`${s.label}${isDone ? ', done' : ''}`}
            style={[styles.step, isCurrent ? styles.current : isDone ? styles.done : styles.todo]}>
            <View style={[styles.dot, isCurrent ? styles.dotCurrent : isDone ? styles.dotDone : styles.dotTodo]}>
              {isDone && !isCurrent ? <Check size={10} color="#fff" strokeWidth={3.5} /> : <Text variant="caption" weight="bold" color={isCurrent ? '#fff' : ink[500]}>{i + 1}</Text>}
            </View>
            <Text variant="caption" weight="bold" color={isCurrent ? '#fff' : isDone ? success[700] : ink[500]}>{s.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { gap: 6, paddingVertical: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.medium, paddingHorizontal: 10, minHeight: 34 },
  current: { backgroundColor: zappy[600] },
  done: { backgroundColor: success[50] },
  todo: { backgroundColor: colors.surface, borderWidth: 1, borderColor: slate[200] },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dotCurrent: { backgroundColor: 'rgba(255,255,255,0.2)' },
  dotDone: { backgroundColor: success[500] },
  dotTodo: { backgroundColor: slate[100] },
});
