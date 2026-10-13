/**
 * Where it is happening, and who is doing it (the website's ProviderStep).
 * The pin is checked first; then what the customer chose, when, and who can
 * actually do it at what price, sortable without hiding anyone.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AlertTriangle, HelpCircle } from 'lucide-react-native';
import { useRepairPricePreviewQuery, useRepairProvidersQuery } from '@zappy/core/api';
import { Button, Text } from '@zappy/ui/components';
import { WhenChooser } from '@zappy/ui/components/booking/SlotPicker';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { accent, colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { ChosenSummary } from './ChosenSummary';
import { ConfirmPinCard } from './ConfirmPinCard';
import type { Diagnosis } from './DiagnoseStep';
import { Shell, Spinner, flow } from './FlowChrome';
import { NoProvidersCard, type ProvidersResult } from './NoProvidersCard';
import { ProviderCard } from './ProviderCard';
import { rankProviders, samePlace, type Provider } from './repairRules';

type Named = { code: string; name: string } | null;
type Sort = 'best' | 'fast' | 'cheap';
const SORTS: { key: Sort; label: string }[] = [{ key: 'best', label: 'Recommended' }, { key: 'fast', label: 'Fastest' }, { key: 'cheap', label: 'Lowest price' }];

export function ProviderStep({ vertical, diagnosis, model, brand, configuration, problem, location, serviceMode, pinConfirmed, onPinConfirmed, onChangeLocation, onPick, onInspectInstead, scheduledAt, onWhen }: {
  vertical: string; diagnosis: Diagnosis | null; model: Named; brand: Named; configuration: Named; problem: Named;
  location: BookingLocation | null; serviceMode: string; pinConfirmed: boolean; onPinConfirmed: () => void; onChangeLocation: () => void;
  onPick: (p: Provider | null, repairCode: string | undefined, qualityCode: string | null) => void; onInspectInstead?: () => void;
  scheduledAt: Date | null; onWhen?: (d: Date | null) => void;
}) {
  const [sortBy, setSortBy] = useState<Sort>('best');
  const repairCode = diagnosis?.primaryRepairCode || diagnosis?.recommendations?.[0]?.repairCode;
  const needsDiagnosis = diagnosis?.requiresDiagnosis;
  const inspectionOnly = serviceMode === 'diagnosis_only';
  const ready = pinConfirmed && !!location;

  const { data, isFetching } = useRepairProvidersQuery({
    vertical, repairCode, brandCode: brand?.code, modelCode: model?.code, serviceMode, lat: location?.lat, lng: location?.lng,
    ...(scheduledAt && { scheduledAt: scheduledAt.toISOString() }),
  }, { skip: inspectionOnly || !repairCode || !ready });
  const result = data as (ProvidersResult & { providers?: Provider[]; recommended?: Provider }) | undefined;
  const providers = result?.providers || [];
  const allOffline = !providers.length && (result?.nearbyCount || 0) > 0 && result?.primaryReason === 'offline';
  const { data: standard } = useRepairPricePreviewQuery({ vertical, repairCode, brandCode: brand?.code, modelCode: model?.code, serviceMode }, { skip: !allOffline || !repairCode });
  const standardPaise = standard?.reference && standard?.estimate?.totalPaise > 0 ? standard.estimate.totalPaise as number : null;

  if (!ready) return <ConfirmPinCard location={location} onConfirm={onPinConfirmed} onPick={onChangeLocation} />;

  const summary = <ChosenSummary brand={brand} model={model} configuration={configuration} problem={problem} diagnosis={diagnosis} serviceMode={serviceMode} location={location} onChangeLocation={onChangeLocation} />;

  if (inspectionOnly || !repairCode) {
    return (
      <Shell>
        {summary}
        {inspectionOnly ? (
          <View style={[flow.card, styles.row]}>
            <HelpCircle size={18} color={zappy[600]} />
            <View style={flow.flex}>
              <Text variant="bodySmall" weight="bold">Inspection booking</Text>
              <Text variant="caption" color={ink[500]}>We will assign a qualified technician. They will inspect your device, explain what is wrong, and give you a written diagnosis, with no obligation to proceed.</Text>
            </View>
          </View>
        ) : (
          <View style={[flow.card, styles.row, styles.warn]}>
            <AlertTriangle size={18} color={accent[600]} />
            <View style={flow.flex}>
              <Text variant="bodySmall" weight="bold" color={accent[700]}>This one needs a look first</Text>
              {diagnosis?.summary ? <Text variant="caption" color={accent[700]}>{diagnosis.summary}</Text> : null}
            </View>
          </View>
        )}
        <Button label={inspectionOnly ? 'Continue' : 'Book a diagnosis visit'} onPress={() => onPick(null, repairCode, null)} fullWidth />
      </Shell>
    );
  }

  const ranked = rankProviders(providers, result?.recommended, sortBy);
  return (
    <Shell>
      {summary}
      {onWhen ? <WhenChooser value={scheduledAt} onChange={onWhen} /> : null}
      {needsDiagnosis ? <View style={[flow.card, styles.note]}><Text variant="caption" weight="semibold" color={zappy[700]}>Prices below are estimates. The final figure is confirmed after the technician inspects your device.</Text></View> : null}
      {isFetching && !providers.length ? <Spinner /> : null}
      {!isFetching && !ranked.length ? (
        <NoProvidersCard data={result} vertical={vertical} location={location!} standardPaise={standardPaise} needsDiagnosis={needsDiagnosis}
          request={{ brandCode: brand?.code, modelCode: model?.code, configurationCode: configuration?.code || null, problemCodes: problem?.code ? [problem.code] : [], repairCode, serviceMode }}
          onBookStandard={() => onPick({ auto: true, name: 'First available technician', totalPaise: standardPaise }, repairCode, null)}
          onInspectInstead={onInspectInstead} onChangeLocation={onChangeLocation} />
      ) : null}
      {ranked.length ? (
        <>
          <Text variant="caption" weight="black" color={ink[500]} style={styles.count}>{ranked.length} SHOP{ranked.length === 1 ? '' : 'S'} AVAILABLE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
            {SORTS.map((s) => {
              const on = sortBy === s.key;
              return (
                <Pressable key={s.key} onPress={() => setSortBy(s.key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.sort, on && styles.sortOn]}>
                  <Text variant="caption" weight="bold" color={on ? '#fff' : ink[700]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {ranked.map((p, i) => (
            <ProviderCard key={p.shopId || p.workerId || i} p={p} recommended={sortBy === 'best' && samePlace(p, result?.recommended)} serviceMode={serviceMode} onPick={(q) => onPick(p, repairCode, q)} />
          ))}
        </>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  warn: { backgroundColor: accent[50], borderColor: accent[100] },
  note: { backgroundColor: zappy[50], borderColor: zappy[100] },
  count: { paddingHorizontal: 4, paddingTop: 4 },
  sorts: { gap: spacing.sm, paddingBottom: 4 },
  sort: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sortOn: { backgroundColor: ink[900], borderColor: ink[900] },
});
