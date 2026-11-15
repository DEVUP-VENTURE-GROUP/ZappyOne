// Every live price up or down by a whole % (the website's AdjustAllPrices): always from the normal price, 0 puts them back.
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useAdjustRepairProviderPricingMutation } from '@zappy/core/api';
import { Button, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { errText } from '../../../lib/feedback';
import { colors, ink } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';

export function AdjustAllPrices({ vertical, rows }: { vertical: string; rows: object[] }) {
  const [adjustAll, { isLoading }] = useAdjustRepairProviderPricingMutation();
  const [percent, setPercent] = useState('');
  if (!rows.length) return null;

  async function apply(pct: number) {
    if (!Number.isInteger(pct) || pct < -50 || pct > 100) { toast.error('Enter a whole number from -50 to 100'); return; }
    try {
      const res = await adjustAll({ vertical, percent: pct }).unwrap();
      toast.success(res.note);
      setPercent('');
    } catch (err) { toast.error(errText(err, 'Could not change prices. Try again.')); }
  }

  return (
    <View style={styles.card}>
      <Text variant="bodySmall" weight="bold">Change all prices</Text>
      <Text variant="caption" color={ink[500]}>Raise or lower every price at once. It always counts from your normal prices.</Text>
      <View style={styles.row}>
        <TextInput value={percent} onChangeText={(v) => setPercent(v.replace(/[^0-9-]/g, ''))} keyboardType="numbers-and-punctuation" placeholder="10"
          accessibilityLabel="Percent change" style={styles.input} maxLength={4} />
        <Text variant="bodySmall" weight="bold" color={ink[500]}>%</Text>
        <Button label="Apply" size="small" disabled={!percent || isLoading} loading={isLoading} onPress={() => apply(Number(percent))} />
      </View>
      {rows.some((r) => (r as { normalPaise?: number | null }).normalPaise != null) ? <Button label="Back to normal prices" variant="outline" size="small" disabled={isLoading} onPress={() => apply(0)} fullWidth /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { width: 80, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, color: ink[900], fontSize: 15 },
});
