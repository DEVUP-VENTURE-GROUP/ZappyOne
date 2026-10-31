import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { Text } from '../components';
import { JobCard } from '../components/jobs/JobCard';
import { ink, zappy } from '../theme/colors';
import { spacing } from '../theme/spacing';

type Extra = { name?: string; pricePaise?: number; taxPaise?: number };
const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

// Services the customer added after booking (the websites' ExtrasCard): already in the total, collected in cash.
export function ExtrasCard({ extras }: { extras?: Extra[] | null }) {
  if (!extras?.length) return null;
  const each = (e: Extra) => (e.pricePaise || 0) + (e.taxPaise || 0);
  const sum = extras.reduce((a, e) => a + each(e), 0);
  return (
    <JobCard style={styles.gap}>
      <View style={styles.head}>
        <Plus size={14} color={zappy[700]} />
        <Text variant="caption" weight="semibold" color={zappy[700]}>ADDED BY THE CUSTOMER</Text>
      </View>
      {extras.map((e, i) => (
        <View key={i} style={styles.line}>
          <Text variant="body" numberOfLines={1} style={styles.flex}>{e.name}</Text>
          <Text variant="body" weight="semibold">{rupees(each(e))}</Text>
        </View>
      ))}
      <Text variant="caption" color={ink[500]}>Included in the total. Collect {rupees(sum)} extra in cash.</Text>
    </JobCard>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  line: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
});
