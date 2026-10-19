/**
 * Which model (the website's ModelStep): search the brand's models, grouped by
 * series. If a device the customer sent for identification has since been
 * identified, it is offered here, where they gave up. An empty list is a real
 * state (a brand is added before its models), so the way forward is the main
 * action, not a faint link.
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ChevronRight, HelpCircle, Laptop, Search, Smartphone } from 'lucide-react-native';
import { useMyModelIdentificationsQuery, useRepairModelsQuery } from '@zappy/core/api';
import { Button, Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Coded } from './BrandStep';
import { IdentifySheet, MissingItemSheet } from './CatalogRequestSheets';
import { Shell, Spinner, flow } from './FlowChrome';

export interface Model extends Coded { seriesName?: string; imageUrl?: string; productNumbers?: string[]; productTypeCode?: string; fuelTypes?: string[] }

export function ModelStep({ vertical, deep, brand, productType, family, onPick, onAuto }: {
  vertical: string; deep: boolean; brand: Coded; productType: Coded | null; family: Coded | null; onPick: (m: Model) => void; onAuto?: (m: Model) => void;
}) {
  const [q, setQ] = useState('');
  const [missing, setMissing] = useState(false);
  const { data, isLoading } = useRepairModelsQuery({ vertical, brandCode: brand.code, q: q || undefined, productTypeCode: productType?.code, familyCode: family?.code });
  const { data: identifications } = useMyModelIdentificationsQuery(vertical, { skip: !deep });
  const identified = ((identifications?.requests || []) as { status: string; resolvedModelId?: Model }[]).find((r) => r.status === 'identified' && r.resolvedModelId);
  const models: Model[] = data?.models || [];
  // One model for this brand (a vehicle type for washes): chosen for them and the step skipped.
  const only = !isLoading && !q && models.length === 1 ? models[0] : null;
  useEffect(() => { if (only && onAuto) onAuto(only); }, [only]); // eslint-disable-line react-hooks/exhaustive-deps

  // Series is a label, not a step: it groups a long list without another tap.
  const grouped: { key: string; items: Model[] }[] = [];
  for (const m of models) {
    const key = m.seriesName || '';
    const bucket = grouped.find((g) => g.key === key);
    if (bucket) bucket.items.push(m); else grouped.push({ key, items: [m] });
  }
  const Device = deep ? Laptop : Smartphone;

  return (
    <Shell>
      {missing ? (deep ? <IdentifySheet vertical={vertical} brand={brand} onClose={() => setMissing(false)} />
        : <MissingItemSheet kind="model" brandName={brand.name} onClose={() => setMissing(false)} />) : null}
      {identified?.resolvedModelId ? (
        <Pressable onPress={() => onPick(identified.resolvedModelId!)} accessibilityRole="button" style={[flow.card, styles.identified]}>
          <Text variant="caption" weight="black" color={success[700]}>WE IDENTIFIED YOUR DEVICE</Text>
          <Text variant="bodySmall" weight="bold" color={success[700]}>{identified.resolvedModelId.name}</Text>
          <Text variant="caption" color={success[700]}>Tap to continue with this one.</Text>
        </Pressable>
      ) : null}
      <View style={styles.search}>
        <Search size={15} color={ink[400]} />
        <TextInput value={q} onChangeText={setQ} autoFocus placeholder={deep ? `Search ${brand.name} models or product number…` : `Search ${brand.name} models…`}
          placeholderTextColor={ink[400]} style={styles.input} accessibilityLabel="Search models" />
      </View>
      {isLoading || only ? <Spinner /> : (
        <>
          {grouped.map((g) => (
            <View key={g.key || 'all'} style={styles.group}>
              {g.key ? <Text variant="caption" weight="bold" color={ink[500]} style={flow.label}>{g.key.toUpperCase()}</Text> : null}
              {g.items.map((m) => (
                <Pressable key={m.code} onPress={() => onPick(m)} android_ripple={RIPPLE} accessibilityRole="button" style={[flow.card, flow.row]}>
                  <View style={styles.thumb}>{m.imageUrl ? <Image source={{ uri: webAsset(m.imageUrl) || undefined }} style={StyleSheet.absoluteFill} /> : <Device size={18} color={ink[400]} />}</View>
                  <View style={flow.flex}>
                    <Text variant="bodySmall" weight="semibold" numberOfLines={1}>{m.name}</Text>
                    {m.productNumbers?.length ? <Text variant="caption" color={ink[400]} numberOfLines={1}>{m.productNumbers.slice(0, 3).join(', ')}</Text> : null}
                  </View>
                  <ChevronRight size={16} color={slate[300]} />
                </Pressable>
              ))}
            </View>
          ))}
          {!models.length ? (
            <View style={[flow.card, styles.empty]}>
              <Text variant="bodySmall" weight="bold" style={styles.center}>{q ? `No ${brand.name} models matched "${q}"` : `We haven't listed ${brand.name} models yet`}</Text>
              <Text variant="caption" color={ink[500]} style={styles.center}>{deep ? 'Tell us what is on the sticker and we will identify it, usually the same day.' : "Tell us which model you have and we'll add it."}</Text>
              <Button label={deep ? 'Help us identify it' : 'Tell us your model'} onPress={() => setMissing(true)} fullWidth />
            </View>
          ) : (
            <Pressable onPress={() => setMissing(true)} style={flow.link}><HelpCircle size={15} color={zappy[600]} /><Text variant="bodySmall" weight="semibold" color={zappy[600]}>{deep ? "I don't know my model" : "Can't find your model?"}</Text></Pressable>
          )}
        </>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  identified: { borderColor: success[100], backgroundColor: success[50] },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900] },
  group: { gap: spacing.sm },
  thumb: { width: 40, height: 40, borderRadius: radius.medium, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
});
