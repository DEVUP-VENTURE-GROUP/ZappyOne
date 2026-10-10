/**
 * A shop's opening hours for the week, the one editor for setup and profile
 * (the websites' WeeklyHours). Each day is open or closed, with its times and
 * how long that makes the day, so a slipped AM/PM is obvious. The rules are
 * shared with the websites (weeklyHoursRules).
 *
 *   hours     [{ day: 0-6 (Sun first), opensAt: 'HH:MM', closesAt: 'HH:MM', isClosed }]
 *   onChange  receives the whole new list
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DAYS, dayLength, dayOf, to12Hour, weekdaysLike, withDay } from '@zappy/core/shared/weeklyHoursRules';
import { Text } from '..';
import { toast } from '../Toast';
import { accent, colors, ink, slate, success, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { TimePickerSheet } from './TimePickerSheet';

export interface DayHours { day: number; opensAt: string; closesAt: string; isClosed: boolean }

const shown = (hhmm: string) => {
  const t = to12Hour(hhmm);
  return t.hour ? `${t.hour}:${t.minute} ${t.meridiem}` : 'Set time';
};

export function WeeklyHours({ hours, onChange }: { hours: DayHours[]; onChange: (h: DayHours[]) => void }) {
  const [editing, setEditing] = useState<{ day: number; field: 'opensAt' | 'closesAt' } | null>(null);
  const setDay = (day: number, patch: Partial<DayHours>) => onChange(withDay(hours, day, patch));

  function applyWeekdays() {
    const week = weekdaysLike(hours);
    if (!week) { toast.error('Set one day first, then apply it to the rest'); return; }
    onChange(week);
    toast.success('Applied Monday to Saturday');
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={applyWeekdays} hitSlop={8} accessibilityRole="button" style={styles.apply}>
        <Text variant="caption" weight="bold" color={zappy[600]}>Apply one day to Mon–Sat</Text>
      </Pressable>
      <View style={styles.card}>
        {DAYS.map((label: string, day: number) => {
          const row: DayHours = dayOf(hours, day);
          const len = row.isClosed ? null : dayLength(row.opensAt, row.closesAt);
          return (
            <View key={day} style={[styles.day, day > 0 && styles.rule]}>
              <View style={styles.row}>
                <Text variant="caption" weight="bold" color={ink[700]} style={styles.dayName}>{label}</Text>
                <Pressable onPress={() => setDay(day, { isClosed: !row.isClosed })} accessibilityRole="switch" accessibilityState={{ checked: !row.isClosed }}
                  accessibilityLabel={`${label} ${row.isClosed ? 'closed' : 'open'}`} style={[styles.toggle, row.isClosed ? styles.closed : styles.open]}>
                  <Text variant="caption" weight="bold" color={row.isClosed ? ink[500] : success[700]}>{row.isClosed ? 'Closed' : 'Open'}</Text>
                </Pressable>
                {row.isClosed ? <Text variant="caption" color={ink[400]}>Not open this day</Text> : null}
              </View>
              {!row.isClosed ? (
                <View style={styles.times}>
                  <Pressable onPress={() => setEditing({ day, field: 'opensAt' })} accessibilityRole="button" accessibilityLabel={`${label} opens at ${shown(row.opensAt)}`} style={styles.time}>
                    <Text variant="bodySmall" weight="semibold" color={row.opensAt ? ink[900] : ink[400]}>{shown(row.opensAt)}</Text>
                  </Pressable>
                  <Text variant="caption" color={ink[400]}>to</Text>
                  <Pressable onPress={() => setEditing({ day, field: 'closesAt' })} accessibilityRole="button" accessibilityLabel={`${label} closes at ${shown(row.closesAt)}`} style={styles.time}>
                    <Text variant="bodySmall" weight="semibold" color={row.closesAt ? ink[900] : ink[400]}>{shown(row.closesAt)}</Text>
                  </Pressable>
                  {len ? (
                    <Text variant="caption" weight="semibold" color={len.short ? accent[600] : ink[400]} style={styles.len}>
                      {len.overnight ? 'overnight · ' : ''}{len.label}{len.short ? ', is that right?' : ''}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {editing ? (
        <TimePickerSheet title={`${DAYS[editing.day]} ${editing.field === 'opensAt' ? 'opens at' : 'closes at'}`}
          value={dayOf(hours, editing.day)[editing.field]} onPick={(v) => setDay(editing.day, { [editing.field]: v })} onClose={() => setEditing(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  apply: { alignSelf: 'flex-start' },
  card: { borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  day: { paddingVertical: spacing.md, gap: spacing.sm },
  rule: { borderTopWidth: 1, borderTopColor: slate[100] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayName: { width: 36 },
  toggle: { borderRadius: radius.medium, paddingHorizontal: 10, paddingVertical: 4 },
  open: { backgroundColor: success[50] },
  closed: { backgroundColor: slate[100] },
  times: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  time: { minHeight: 38, minWidth: 96, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200], paddingHorizontal: spacing.md },
  len: { width: '100%' },
});
