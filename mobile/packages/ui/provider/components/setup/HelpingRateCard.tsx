import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Footprints } from 'lucide-react-native';
import { useHelpingProviderRatesQuery, useSaveHelpingProviderRateMutation } from '@zappy/core/api';
import { Button, ErrorState, LoadingState, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { errText } from '../../../lib/feedback';
import { colors, ink, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';

type Field = [string, string, boolean];
const FIELDS: Field[] = [
  ['baseFeePaise', 'Errand fee', true],
  ['perKmPaise', 'Per km', true],
  ['includedKm', 'Free km', false],
  ['waitingPerMinutePaise', 'Waiting, per minute', true],
  ['extraStopPaise', 'Extra stop', true],
  ['specialHandlingPaise', 'Heavy or fragile', true],
];
interface Errand { serviceType: string; name: string; rate: Record<string, number> | null }

// A helper's own rates for each errand in one service (the websites' HelpingRateCard); `fallback` shows when the service has no errands to price.
export function HelpingRateCard({ lineCode, fallback = null }: { lineCode: string; fallback?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch, error } = useHelpingProviderRatesQuery(lineCode);
  if (isError && !data) return <ErrorState title="This did not load" message={errText(error, 'Check your internet and try again.')} onRetry={refetch} />;
  if (isLoading) return <LoadingState />;
  const types: Errand[] = data?.types || [];
  if (!types.length) return <>{fallback}</>;
  return (
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
      <View style={styles.row}>
        <View style={styles.icon}><Footprints size={18} color={zappy[700]} /></View>
        <View style={styles.flex}>
          <Text variant="heading3" weight="extrabold">Your rates</Text>
          <Text variant="caption" color={ink[500]}>Customers near you are offered the best rate; jobs ring you when your rate fits. Leave the fee empty to not take that errand.</Text>
        </View>
      </View>
      {types.map((t) => <ErrandRate key={t.serviceType} lineCode={lineCode} errand={t} />)}
    </ScrollView>
  );
}

function ErrandRate({ lineCode, errand }: { lineCode: string; errand: Errand }) {
  const [save, { isLoading }] = useSaveHelpingProviderRateMutation();
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    setV(Object.fromEntries(FIELDS.map(([k, , money]) => [k, errand.rate?.[k] ? String(money ? Math.round(errand.rate[k] / 100) : errand.rate[k]) : ''])));
  }, [errand]);
  async function submit() {
    try {
      await save({ lineCode, serviceType: errand.serviceType, ...Object.fromEntries(FIELDS.map(([k, , money]) => [k, money ? Math.round(Number(v[k] || 0) * 100) : Number(v[k] || 0)])) }).unwrap();
      toast.success(Number(v.baseFeePaise) > 0 ? `${errand.name}: rates live` : `${errand.name}: not offered`);
    } catch (e) { toast.error(errText(e, 'Could not save')); }
  }
  return (
    <View style={styles.card}>
      <Text variant="bodySmall" weight="bold">{errand.name}{!errand.rate ? '  · not priced yet' : ''}</Text>
      <View style={styles.wrap}>
        {FIELDS.map(([k, label, money]) => (
          <View key={k} style={styles.cell}>
            <Text variant="caption" weight="semibold" color={ink[500]}>{label}</Text>
            <View style={styles.field}>
              {money ? <Text variant="bodySmall" weight="semibold" color={ink[400]}>₹</Text> : null}
              <TextInput value={v[k] ?? ''} onChangeText={(x) => setV((m) => ({ ...m, [k]: x.replace(/\D/g, '').slice(0, 6) }))} keyboardType="number-pad" accessibilityLabel={`${errand.name}, ${label}`} style={styles.input} />
              {!money ? <Text variant="caption" color={ink[400]}>km</Text> : null}
            </View>
          </View>
        ))}
      </View>
      <Button label={`Save ${errand.name.toLowerCase()} rates`} size="small" onPress={submit} loading={isLoading} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.base, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cell: { width: '47%', gap: 4 },
  field: { flexDirection: 'row', alignItems: 'center', height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, paddingLeft: 4, fontSize: 15, fontFamily: 'Figtree-Bold', color: ink[900] },
});
