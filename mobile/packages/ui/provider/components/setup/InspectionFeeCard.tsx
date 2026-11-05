import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { useProviderInspectionFeeQuery, useSetProviderInspectionFeeMutation } from '@zappy/core/api';
import { Button, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { errText } from '../../../lib/feedback';
import { accent, colors, ink, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';

// The provider's own fee for going to look before quoting (the websites' InspectionFeeCard); 0 is a free inspection and all of it is theirs.
export function InspectionFeeCard({ vertical }: { vertical: string }) {
  const { data } = useProviderInspectionFeeQuery(vertical);
  const [save, { isLoading }] = useSetProviderInspectionFeeMutation();
  const [fee, setFee] = useState('');
  useEffect(() => { if (data) setFee(String(Math.round((data.feePaise || 0) / 100))); }, [data]);
  // Required for every service: until one is saved (₹0 counts, a free inspection), Save stays on.
  const notSet = !!data && (data as { set?: boolean }).set === false;
  const changed = !!data && (notSet || Number(fee || 0) * 100 !== (data.feePaise || 0));

  async function submit() {
    try { await save({ vertical, feePaise: Math.round(Number(fee || 0) * 100) }).unwrap(); toast.success(Number(fee) > 0 ? 'Inspection fee saved' : 'Your inspections are free'); } catch (e) { toast.error(errText(e, 'Could not save')); }
  }

  return (
    <View style={[styles.card, notSet && styles.cardNeeded]}>
      <View style={styles.row}>
        <View style={styles.icon}><Search size={18} color={zappy[700]} /></View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="bold">Your inspection fee{notSet ? <Text variant="caption" weight="bold" color={accent[700]}>  Required</Text> : null}</Text>
          <Text variant="caption" color={ink[500]}>What you charge to come and check before you give a price. Write 0 for a free visit. All of it is yours.</Text>
          {notSet ? <Text variant="caption" weight="semibold" color={accent[700]}>Save it to get inspection jobs for this service.</Text> : null}
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.field}>
          <Text variant="bodySmall" weight="semibold" color={ink[400]}>₹</Text>
          <TextInput value={fee} onChangeText={(v) => setFee(v.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" accessibilityLabel="Inspection fee in rupees" style={styles.input} />
        </View>
        <Button label="Save" size="small" onPress={submit} loading={isLoading} disabled={!changed} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardNeeded: { borderColor: accent[500], backgroundColor: accent[50] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  icon: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  field: { flexDirection: 'row', alignItems: 'center', height: 42, width: 110, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.sm },
  input: { flex: 1, minWidth: 0, paddingLeft: 4, fontSize: 15, fontFamily: 'Figtree-Bold', color: ink[900] },
});
