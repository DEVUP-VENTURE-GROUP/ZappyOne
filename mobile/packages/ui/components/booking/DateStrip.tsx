/**
 * Pick a day (the websites' <input type="date"> for stays): the next `days`
 * days on one scrolling strip. `value`/`onChange` use "YYYY-MM-DD", the same
 * string the website sends; days before `min` are not offered.
 */
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { dayName, startOfDay } from '@zappy/core/shared/slots';
import { Text } from '../Text';
import { colors, ink, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function DateStrip({ value, onChange, min, days = 30 }: { value: string; onChange: (day: string) => void; min?: string; days?: number }) {
  const list = useMemo(() => {
    const first = startOfDay(min ? new Date(`${min}T00:00:00`) : new Date());
    return Array.from({ length: days }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d; });
  }, [min, days]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {list.map((d) => {
        const key = iso(d);
        const on = key === value;
        return (
          <Pressable key={key} onPress={() => onChange(key)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.day, on && styles.on]}>
            <Text variant="caption" weight="semibold" color={on ? 'rgba(255,255,255,0.85)' : ink[500]}>{dayName(d)}</Text>
            <Text variant="body" weight="bold" color={on ? '#fff' : ink[900]}>{d.getDate()}</Text>
            <Text variant="caption" color={on ? 'rgba(255,255,255,0.85)' : ink[400]}>{d.toLocaleDateString('en-IN', { month: 'short' })}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  day: { width: 58, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  on: { backgroundColor: zappy[600], borderColor: zappy[600] },
});
