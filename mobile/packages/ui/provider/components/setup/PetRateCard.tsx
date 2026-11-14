import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PawPrint } from 'lucide-react-native';
import { usePetProviderRatesQuery, useSavePetProviderRatesMutation } from '@zappy/core/api';
import { Button, ErrorState, LoadingState, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { errText } from '../../../lib/feedback';
import { colors, ink, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { PriceNotice } from '../PriceNotice';

interface Service { code: string; name: string; categoryCode: string; per: string; sizes: string[]; prices: Record<string, number | null> }
interface Card { sizes: string[]; services: Service[]; addons: { code: string; name: string; pricePaise: number | null }[]; pickupPaise: number; returnPaise: number }
const SIZE: Record<string, string> = { small: 'Small', medium: 'Medium', large: 'Large', extra_large: 'Extra large' };
const toR = (p: number | null | undefined) => (p == null || p === 0 ? '' : String(Math.round(p / 100)));
const toP = (r: string | undefined) => (Number(r) >= 1 ? Math.round(Number(r) * 100) : null);

// A pet care provider's own prices for one pet service (the websites' PetRateCard): a price per pet size, add-ons, pickup and drop-back. ZappyOne sets none.
export function PetRateCard({ category }: { category: string }) {
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch, error } = usePetProviderRatesQuery(undefined);
  const [save, { isLoading: saving }] = useSavePetProviderRatesMutation();
  const [rates, setRates] = useState<Record<string, Record<string, string>>>({});
  const [addons, setAddons] = useState<Record<string, string>>({});
  const [fees, setFees] = useState({ pickup: '', ret: '' });
  const card = data as Card | undefined;
  useEffect(() => {
    if (!card) return;
    setRates(Object.fromEntries(card.services.map((s) => [s.code, Object.fromEntries(s.sizes.map((z) => [z, toR(s.prices[z])]))])));
    setAddons(Object.fromEntries(card.addons.map((a) => [a.code, toR(a.pricePaise)])));
    setFees({ pickup: toR(card.pickupPaise), ret: toR(card.returnPaise) });
  }, [card]);
  if (isError && !data) return <ErrorState title="This did not load" message={errText(error, 'Check your internet and try again.')} onRetry={refetch} />;
  if (isLoading || !card) return <LoadingState />;
  const mine = card.services.filter((s) => s.categoryCode === category);

  function fill(code: string, sizes: string[]) {
    const first = rates[code]?.[sizes[0]];
    if (!(Number(first) >= 1)) return;
    setRates((r) => ({ ...r, [code]: Object.fromEntries(sizes.map((z) => [z, r[code]?.[z] || first])) }));
  }
  async function submit() {
    if (!card) return;
    try {
      await save({
        rates: card.services.map((s) => ({ variantCode: s.code, prices: Object.fromEntries(s.sizes.map((z) => [z, toP(rates[s.code]?.[z])])) })),
        addonPrices: card.addons.map((a) => ({ code: a.code, pricePaise: toP(addons[a.code]) })),
        pickupPaise: toP(fees.pickup) || 0, returnPaise: toP(fees.ret) || 0,
      }).unwrap();
      toast.success('Your prices are live');
    } catch (e) { toast.error(errText(e, 'Could not save')); }
  }
  const money = (value: string, onChange: (v: string) => void, label: string, onBlur?: () => void) => (
    <View style={styles.field}>
      <Text variant="bodySmall" weight="semibold" color={ink[400]}>₹</Text>
      <TextInput value={value} onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))} onBlur={onBlur} keyboardType="number-pad" accessibilityLabel={label} style={styles.input} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
      <PriceNotice />
      <View style={styles.row}>
        <View style={styles.icon}><PawPrint size={18} color={zappy[700]} /></View>
        <View style={styles.flex}>
          <Text variant="heading3" weight="extrabold">Your prices</Text>
          <Text variant="caption" color={ink[500]}>Set your own price for each pet size. Leave a size empty if you do not take it. Live as soon as you save.</Text>
        </View>
      </View>
      {mine.map((s) => (
        <View key={s.code} style={styles.card}>
          <Text variant="bodySmall" weight="bold">{s.name}<Text variant="caption" color={ink[500]}>  · price for {s.per}</Text></Text>
          <View style={styles.wrap}>
            {s.sizes.map((z, i) => (
              <View key={z} style={styles.size}>
                <Text variant="caption" weight="semibold" color={ink[500]}>{SIZE[z] || z}</Text>
                {money(rates[s.code]?.[z] ?? '', (v) => setRates((r) => ({ ...r, [s.code]: { ...r[s.code], [z]: v } })), `${s.name}, ${SIZE[z]}`, i === 0 ? () => fill(s.code, s.sizes) : undefined)}
              </View>
            ))}
          </View>
        </View>
      ))}
      {card.addons.length ? (
        <View style={styles.card}>
          <Text variant="bodySmall" weight="bold">Add-ons you offer<Text variant="caption" color={ink[500]}>  · leave empty to not offer one</Text></Text>
          {card.addons.map((a) => (
            <View key={a.code} style={styles.row}>
              <Text variant="caption" color={ink[700]} style={styles.flex}>{a.name}</Text>
              <View style={styles.addon}>{money(addons[a.code] ?? '', (v) => setAddons((m) => ({ ...m, [a.code]: v })), a.name)}</View>
            </View>
          ))}
        </View>
      ) : null}
      <View style={[styles.card, styles.wrap]}>
        <View style={styles.size}><Text variant="caption" weight="semibold" color={ink[500]}>Pickup fee</Text>{money(fees.pickup, (v) => setFees((f) => ({ ...f, pickup: v })), 'Pickup fee')}</View>
        <View style={styles.size}><Text variant="caption" weight="semibold" color={ink[500]}>Drop-back fee</Text>{money(fees.ret, (v) => setFees((f) => ({ ...f, ret: v })), 'Drop-back fee')}</View>
      </View>
      <Button label="Save my prices" onPress={submit} loading={saving} fullWidth size="large" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.base, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  size: { width: '47%', gap: 4 },
  addon: { width: 110 },
  field: { flexDirection: 'row', alignItems: 'center', height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, paddingLeft: 4, fontSize: 15, fontFamily: 'Figtree-Bold', color: ink[900] },
});
