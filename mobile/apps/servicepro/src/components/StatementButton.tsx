// A month's statement as a CSV, opened in the phone's browser (the website's StatementDownload); months start at launch.
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FileDown } from 'lucide-react-native';
import { Button, Chip, Text } from '@zappy/ui/components';
import { useOpenDocument } from '@zappy/ui/lib/openDocument';
import { colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { statementMonths } from '@zappy/core/shared/statementMonths';

export function StatementButton() {
  const list = statementMonths(6, 'short');
  const [month, setMonth] = useState(list[0]?.key || '');
  const { open, opening } = useOpenDocument();
  const path = `/api/shops/me/statement/${month}.csv`;
  return (
    <View style={styles.card}>
      <Text variant="bodySmall" weight="bold">Monthly statement</Text>
      <Text variant="caption" color={ink[500]}>What you earned, fees, what you owe and money sent to you, for your accounts and GST.</Text>
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
