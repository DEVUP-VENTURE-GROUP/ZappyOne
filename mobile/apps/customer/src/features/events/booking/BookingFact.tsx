/** One line of when or where, with its icon. */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { ink } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';

export function BookingFact({ icon, text }: { icon: ReactNode; text: string }) {
  return <View style={styles.fact}>{icon}<Text variant="caption" color={ink[700]} style={styles.text}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1 },
});
