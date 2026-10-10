/**
 * Pick a time as people say it: hour, minutes, AM or PM. Twelve says whether it
 * is noon or midnight, where AM/PM truly confuses (a real owner set "8 AM to
 * 12 PM" meaning midnight). Returns "HH:MM", 24-hour, as the server stores it.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MINUTE_STEPS, to12Hour, to24Hour } from '@zappy/core/shared/weeklyHoursRules';
import { BottomSheet, Button, Text } from '..';
import { colors, ink, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));

export function TimePickerSheet({ title, value, onPick, onClose }: { title: string; value: string; onPick: (hhmm: string) => void; onClose: () => void }) {
  const start = to12Hour(value);
  const [hour, setHour] = useState<string>(start.hour || '10');
  const [minute, setMinute] = useState<string>(start.minute || '00');
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>(start.meridiem as 'AM' | 'PM');

  const cell = (on: boolean) => [styles.cell, on && styles.cellOn];
  return (
    <BottomSheet visible onClose={onClose} title={title}>
      <View style={styles.body}>
        <Text variant="caption" weight="bold" color={ink[500]}>HOUR</Text>
        <View style={styles.grid}>
          {HOURS.map((h) => (
            <Pressable key={h} onPress={() => setHour(h)} accessibilityRole="radio" accessibilityState={{ selected: hour === h }} style={cell(hour === h)}>
              <Text variant="bodySmall" weight="bold" color={hour === h ? '#fff' : ink[700]}>{h}</Text>
            </Pressable>
          ))}
        </View>
        <Text variant="caption" weight="bold" color={ink[500]}>MINUTES</Text>
        <View style={styles.grid}>
          {MINUTE_STEPS.map((m: string) => (
            <Pressable key={m} onPress={() => setMinute(m)} accessibilityRole="radio" accessibilityState={{ selected: minute === m }} style={cell(minute === m)}>
              <Text variant="bodySmall" weight="bold" color={minute === m ? '#fff' : ink[700]}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          {(['AM', 'PM'] as const).map((x) => (
            <Pressable key={x} onPress={() => setMeridiem(x)} accessibilityRole="radio" accessibilityState={{ selected: meridiem === x }} style={[styles.ampm, meridiem === x && styles.cellOn]}>
              <Text variant="bodySmall" weight="bold" color={meridiem === x ? '#fff' : ink[700]}>
                {hour === '12' ? (x === 'AM' ? 'AM (midnight)' : 'PM (noon)') : x}
              </Text>
            </Pressable>
          ))}
        </View>
        <Button label={`Set ${hour}:${minute} ${meridiem}`} onPress={() => { onPick(to24Hour({ hour, minute, meridiem })); onClose(); }} fullWidth size="large" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.base, paddingBottom: spacing.base, gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: '15%', minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  cellOn: { backgroundColor: zappy[600], borderColor: zappy[600] },
  row: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
  ampm: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
});
