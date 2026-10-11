/** One day on the partner's calendar: booked (with how many), blocked, today, or past. */
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { accent, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';

export function CalendarDay({ day, past, today, count, blocked, selected, onPress }: {
  day: Date; past: boolean; today: boolean; count: number; blocked: boolean; selected: boolean; onPress: () => void;
}) {
  const booked = count > 0;
  const label = `${day.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}${booked ? ', booked' : blocked ? ', blocked' : ''}`;
  return (
    <Pressable onPress={onPress} disabled={past} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: past }}
      style={[styles.day, booked && styles.booked, blocked && !booked && styles.blocked, today && !booked && styles.today, selected && styles.selected]}>
      <Text variant="bodySmall" weight="semibold" color={past ? ink[300] : booked ? '#fff' : blocked ? ink[400] : ink[900]}
        style={blocked && !booked ? styles.strike : undefined}>{day.getDate()}</Text>
      {count > 1 ? <View style={styles.count}><Text variant="caption" weight="bold" color={zappy[700]} style={styles.small}>{count}</Text></View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  day: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: radius.button },
  booked: { backgroundColor: zappy[600] },
  blocked: { backgroundColor: slate[100] },
  today: { borderWidth: 1.5, borderColor: zappy[600] },
  selected: { borderWidth: 2, borderColor: accent[500] },
  strike: { textDecorationLine: 'line-through' },
  count: { position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  small: { fontSize: 9, lineHeight: 12 },
});
