/** A month's statement (earnings, commission, dues, payouts) as a CSV, opened in the phone's browser (the website's StatementDownload). */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FileDown } from 'lucide-react-native';
import { Button, Chip, Text } from '@zappy/ui/components';
import { useOpenDocument } from '@zappy/ui/lib/openDocument';
import { colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const months = (n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
  return { key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, label: m.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) };
});

export function StatementButton() {
  const list = months(6);
  const [month, setMonth] = useState(list[0].key);
  const { open, opening } = useOpenDocument();
  const path = `/api/shops/me/statement/${month}.csv`;
  return (
    <View style={styles.card}>
      <Text variant="bodySmall" weight="bold">Monthly statement</Text>
      <Text variant="caption" color={ink[500]}>Earnings, fees, dues and payouts, for your accounts and GST.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {list.map((m) => <Chip key={m.key} label={m.label} selected={month === m.key} onPress={() => setMonth(m.key)} />)}
      </ScrollView>
      <Button label="Download statement" variant="outline" icon={<FileDown size={15} color={ink[700]} />} loading={opening === path} onPress={() => open(path)} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chips: { gap: spacing.sm },
});
