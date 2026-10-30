/**
 * What a shop charges: brand, then model, then each job, at each part grade it
 * fits (the websites' PricingStep). The first sheet of every brand covers all
 * its models; a model priced on its own overrides it, so a shop sets a sensible
 * default once instead of typing a sheet per handset before its first booking.
 */
import { PartsNote } from '../../../components/common/PartsNote';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ChevronRight, Search } from 'lucide-react-native';
import {
  useBulkRepairProviderPricingMutation, useRepairBrandsQuery, useRepairModelsQuery,
  useRepairProviderPricingQuery, useRepairWorkCatalogQuery, useSaveRepairCapabilitiesMutation,
} from '@zappy/core/api';
import { Button, LoadingState, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { errText } from '../../../lib/feedback';
import { colors, ink, slate, success, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { PriceRow } from './PriceRow';
import { StepShell } from './StepShell';
import { WarrantySettings } from './WarrantySettings';
import { workModesFor } from './setupFlow';
import {
  countsFor, existingFor, rowsFromValues, type ClaimedRepair, type PriceRowData,
} from './priceSheet';
import { uniqueRepairs, type RepairGroup } from './workSelection';

export function PricingStep({ vertical, onBack, onNext }: { vertical: string; onBack: () => void; onNext: () => void }) {
  const { data: catalog } = useRepairWorkCatalogQuery({ vertical });
  const { data: pricingData, isLoading, refetch } = useRepairProviderPricingQuery(vertical);
  const [bulkSave, { isLoading: saving }] = useBulkRepairProviderPricingMutation();
  const [saveWork] = useSaveRepairCapabilitiesMutation();
  const { data: brandsData } = useRepairBrandsQuery(vertical);

  const brandCodes: string[] = catalog?.brands || [];
  const [brand, setBrand] = useState<string | null>(null);
  // undefined = the model list; null = the brand-wide sheet; a code = that model.
  const [model, setModel] = useState<string | null | undefined>(undefined);
  const [modelLabel, setModelLabel] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const activeBrand = brand || brandCodes[0] || null;

  // Searched on the server: the list comes 50 at a time, and a brand past that must still be findable.
  const { data: modelsData, isFetching: loadingModels } = useRepairModelsQuery({ vertical, brandCode: activeBrand, q: search || undefined }, { skip: !activeBrand });

  const pricing: PriceRowData[] = pricingData?.pricing || [];
  // One row per job: a repair under two headings is still one price.
  const claimed: ClaimedRepair[] = useMemo(() => uniqueRepairs((catalog?.groups || []) as RepairGroup[]).filter((r) => r.selected), [catalog]);
  const existing = useMemo(() => existingFor(pricing, activeBrand, model ?? null), [pricing, activeBrand, model]);
  const counts = useMemo(() => countsFor(pricing, activeBrand), [pricing, activeBrand]);
  const brandName = (code: string | null) => (brandsData?.brands || []).find((b: { code: string; name: string }) => b.code === code)?.name || code || '';

  if (isLoading) return <LoadingState />;

  /** Take one job off the shop's work, saved like the work step, with Undo. */
  const setWork = (codes: string[]) => saveWork({
    vertical, repairCodes: codes, candidateCodes: uniqueRepairs((catalog?.groups || []) as RepairGroup[]).map((r) => r.code), brandCodes,
    skillLevel: catalog?.skillLevel || 2, serviceModes: workModesFor(vertical),
  }).unwrap();
  async function removeJob(repair: ClaimedRepair) {
    const before = claimed.map((r) => r.code);
    try {
      await setWork(before.filter((c) => c !== repair.code));
      toast(`${repair.name} removed`, { action: { label: 'Undo', onPress: () => { setWork(before).catch(() => toast.error('Could not put it back. Tick it again in the work step.')); } } });
    } catch (err) { toast.error(errText(err, 'That did not go through. Please try again.')); }
  }

  function openSheet(code: string | null, label = '') { setModel(code); setModelLabel(label); setValues({}); }



  async function saveSheet() {
    const rows = rowsFromValues(values, claimed, activeBrand, model ?? null);
    if (!rows.length) { toast.error('Enter at least one price'); return; }
    try {
      const res = await bulkSave({ vertical, rows }).unwrap();
      if (res.rejectedCount) toast.error(res.note, { duration: 6000 }); else toast.success(res.note);
      setValues({}); setModel(undefined); refetch();
    } catch (err) { toast.error(errText(err, 'Could not save those prices')); }
  }

  // The price sheet for one model, or the brand-wide sheet
  if (model !== undefined) {
    return (
      <StepShell title={model === null ? `Every ${brandName(activeBrand)} model` : modelLabel || model}
        hint={model === null ? 'A starting price for the whole brand. Any model you price separately overrides this.' : 'Your final price for this model, part and labour together.'}
        onBack={() => { setModel(undefined); setValues({}); }} onNext={saveSheet} nextLabel={saving ? 'Saving…' : 'Save prices'} busy={saving}>
        {!claimed.length ? (
          <View style={styles.empty}><Text variant="bodySmall" weight="bold" color={ink[700]}>No jobs selected yet</Text><Text variant="caption" color={ink[500]}>Go back and tick the work you do first.</Text></View>
        ) : (
          <>
            {claimed.map((r) => (
              <PriceRow key={r.code} repair={r} values={values} existing={existing} onChange={(k, raw) => setValues((v) => ({ ...v, [k]: raw }))}
                onRemove={claimed.length > 1 ? removeJob : undefined} />
            ))}
          </>
        )}
      </StepShell>
    );
  }

  // Brand, then the model list
  const brandCount = counts.get('__brand__') || 0;
  const models: { code: string; name: string }[] = modelsData?.models || [];
  return (
    <StepShell title="What do you charge?" hint="Set your own price for each job, per brand. Change a single model only where you charge differently."
      onBack={onBack} onNext={onNext} nextLabel={pricing.length ? 'Continue' : 'Skip for now'}>
      <PartsNote vertical={vertical} who="partner" />
      {!brandCodes.length ? (
        <View style={styles.empty}><Text variant="bodySmall" weight="bold" color={ink[700]}>No brands chosen yet</Text><Text variant="caption" color={ink[500]}>Go back to the first step and pick the brands you handle.</Text></View>
      ) : (
        <>
          <View style={styles.brands}>
            {brandCodes.map((code) => (
              <Pressable key={code} onPress={() => { setBrand(code); setSearch(''); }} accessibilityRole="tab" accessibilityState={{ selected: activeBrand === code }}
                style={[styles.brand, activeBrand === code && styles.brandOn]}>
                <Text variant="caption" weight="bold" color={activeBrand === code ? '#fff' : ink[700]}>{brandName(code)}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => openSheet(null)} accessibilityRole="button" style={[styles.row, styles.brandRow]}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="bold" color={zappy[800]}>Every {brandName(activeBrand)} model</Text>
              <Text variant="caption" color={zappy[700]}>{brandCount ? `${brandCount} price${brandCount === 1 ? '' : 's'} set, used where a model has none of its own` : 'Set one price sheet that covers the whole brand'}</Text>
            </View>
            <ChevronRight size={16} color={zappy[400]} />
          </Pressable>
          <View style={styles.search}>
            <Search size={15} color={ink[400]} />
            <TextInput value={search} onChangeText={setSearch} placeholder={`Search ${brandName(activeBrand)} models`} placeholderTextColor={ink[400]} style={styles.searchInput} />
          </View>
          {loadingModels ? <LoadingState /> : models.map((m) => {
            const count = counts.get(m.code) || 0;
            return (
              <Pressable key={m.code} onPress={() => openSheet(m.code, m.name)} accessibilityRole="button" style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="bodySmall" weight="semibold" numberOfLines={1}>{m.name}</Text>
                  <Text variant="caption" weight="semibold" color={count ? success[600] : ink[400]}>{count ? `${count} price${count === 1 ? '' : 's'} set` : 'Uses the brand price'}</Text>
                </View>
                <ChevronRight size={15} color={slate[300]} />
              </Pressable>
            );
          })}
          {!loadingModels && !models.length ? (
            <Text variant="caption" color={ink[400]} style={styles.center}>{search ? `No ${brandName(activeBrand)} model matches "${search}".` : 'No models listed for this brand yet.'}</Text>
          ) : null}
          {/* The catalog is never presented as complete. */}
          <Text variant="caption" color={ink[400]} style={styles.center}>Model not listed? Set the brand price above: it covers every model, including ones we have not added yet.</Text>
        </>
      )}
      {claimed.length ? <WarrantySettings vertical={vertical} claimed={claimed} rows={pricing} onSaved={refetch} /> : null}
    </StepShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: 2, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderStyle: 'dashed', borderColor: slate[200] },
  brands: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  brand: { borderRadius: radius.medium, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: slate[100] },
  brandOn: { backgroundColor: ink[900] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  brandRow: { borderColor: zappy[200], backgroundColor: zappy[50] },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900] },
});
