/**
 * Booking for later (the websites' SlotPicker and WhenChooser): a day, then a
 * half-hour, from the shared slot rules. `value`/`onChange`: a Date or null
 * (null = as soon as possible).
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { buildSlots, dayName, slotLabel, startOfDay } from '@zappy/core/shared/slots';
import { Text } from '..';
import { colors, ink, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export { slotLabel };

export function SlotPicker({ value, onChange, days = 7, leadMinutes = 60, fromHour = 8, toHour = 20 }: {
  value: Date | null; onChange: (d: Date) => void; days?: number; leadMinutes?: number; fromHour?: number; toHour?: number;
}) {
  const slots: { day: Date; times: Date[] }[] = useMemo(() => buildSlots({ days, leadMinutes, fromHour, toHour }), [days, leadMinutes, fromHour, toHour]);
  const [dayIdx, setDayIdx] = useState(() => {
    if (!value) return 0;
    const i = slots.findIndex((s) => s.day.getTime() === startOfDay(value).getTime());
    return i >= 0 ? i : 0;
  });
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
        {slots.map((s, i) => (
          <Pressable key={s.day.toISOString()} onPress={() => setDayIdx(i)} accessibilityRole="tab" accessibilityState={{ selected: dayIdx === i }} style={[styles.day, dayIdx === i && styles.on]}>
            <Text variant="caption" weight="semibold" color={dayIdx === i ? 'rgba(255,255,255,0.85)' : ink[500]}>{dayName(s.day)}</Text>
            <Text variant="body" weight="bold" color={dayIdx === i ? '#fff' : ink[900]}>{s.day.getDate()}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.times}>
        {(slots[dayIdx]?.times || []).map((t) => {
          const on = !!value && new Date(value).getTime() === t.getTime();
          return (
            <Pressable key={t.toISOString()} onPress={() => onChange(t)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.time, on && styles.timeOn]}>
              <Text variant="caption" weight="semibold" color={on ? zappy[700] : ink[700]}>{t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** As soon as possible, or a time later. */
export function WhenChooser({ value, onChange }: { value: Date | null; onChange: (d: Date | null) => void }) {
  const [open, setOpen] = useState(!!value);
  const asap = !value && !open;
  return (
    <View style={styles.card}>
      <Text variant="caption" weight="bold" color={ink[500]}>WHEN</Text>
      <View style={styles.row}>
        <Pressable onPress={() => { setOpen(false); onChange(null); }} accessibilityRole="radio" accessibilityState={{ selected: asap }} style={[styles.choice, asap && styles.choiceOn]}>
          <Text variant="bodySmall" weight="bold" color={asap ? zappy[700] : ink[700]}>As soon as possible</Text>
        </Pressable>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="radio" accessibilityState={{ selected: !asap }} style={[styles.choice, !asap && styles.choiceOn]}>
          <Text variant="bodySmall" weight="bold" color={!asap ? zappy[700] : ink[700]} numberOfLines={1}>{value ? slotLabel(value) : 'Pick a time'}</Text>
        </Pressable>
      </View>
      {open ? <SlotPicker value={value} onChange={onChange} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  days: { gap: spacing.sm },
  day: { width: 58, alignItems: 'center', paddingVertical: 6, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200] },
  on: { backgroundColor: zappy[600], borderColor: zappy[600] },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  time: { width: '23.5%', alignItems: 'center', paddingVertical: 6, borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200] },
  timeOn: { borderColor: zappy[600], backgroundColor: zappy[50] },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.medium, borderWidth: 2, borderColor: slate[200] },
  choiceOn: { borderColor: zappy[600], backgroundColor: zappy[50] },
});
