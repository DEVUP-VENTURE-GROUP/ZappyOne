// "Payment done" once a partner has paid ZappyOne everything (core workerHome duesPaidView); the websites' DuesPaidCard.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CircleCheck } from 'lucide-react-native';
import { Text } from '../components';
import { ink, success } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

interface Paid { cleared: boolean; title: string | null; line: string; body: string | null }

export function DuesPaidCard({ paid }: { paid: Paid }) {
  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLiveRegion="polite">
      <CircleCheck size={20} color={success[700]} />
      <View style={styles.flex}>
        <Text variant="body" weight="bold">{paid.title}</Text>
        <Text variant="bodySmall" color={ink[700]}>{paid.line}. {paid.body}</Text>
      </View>
    </View>
  );
}

// The last payment under what is still owed (a part payment).
export function LastPaidLine({ paid }: { paid: Paid | null }) {
  if (!paid || paid.cleared) return null;
  return (
    <View style={styles.line}>
      <CircleCheck size={14} color={success[700]} />
      <Text variant="caption" weight="semibold" color={success[700]}>Last paid: {paid.line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: success[100], backgroundColor: success[50] },
  flex: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
});
