/**
 * The last look before booking (the website's ConfirmStep): what, who, how and
 * when, the price, an optional tip, someone else on site, and cash. One stable
 * idempotency key per visit so a double tap cannot book twice; a price that
 * moved while they decided is refreshed and they book again.
 */
import { deviceName } from '@zappy/core/shared/deviceName';
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';
import { useAppSelector } from '@zappy/core/store/hooks';
import { rememberReturn } from '@zappy/ui/app/AppRoot';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useCreateRepairBookingMutation, useRepairVerticalsQuery } from '@zappy/core/api';
import { bookedRows, termsOf } from '@zappy/core/shared/repairBasket';
import { billWords } from '@zappy/core/shared/repairBill';
import { doorAddress } from '@zappy/core/shared/doorAddress';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { PayMethodPicker, PendingFeeNotice, SomeoneElse, TipAtCheckout } from '@zappy/ui/components/booking/Checkout';
import { slotLabel } from '@zappy/ui/components/booking/SlotPicker';
import { surgeChanged, useSurge } from '@zappy/ui/components/booking/SurgeLines';
import { errText } from '@zappy/ui/lib/feedback';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { ink } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Diagnosis, QA } from './DiagnoseStep';
import { Shell, flow } from './FlowChrome';
import { RepairPriceCard } from './RepairPriceCard';
import { PickerMap } from '@zappy/ui/location/PickerMap';
import { MODE_LABEL, type Provider } from './repairRules';
import { chosenPrice } from '@zappy/core/shared/repairBill';

type Named = { code: string; name: string };

export function ConfirmStep({ vertical, brand, model, configuration, problem, diagnosis, provider, repairCode, qualityCode, serviceMode, inspectionFeePaise, location, fuelType, diagnosticAnswers, diagnosticTranscript, addOnCodes, scheduledAt, proGender = null, onDone }: {
  vertical: string; brand: Named; model: Named; configuration: Named | null; problem: Named; diagnosis: Diagnosis | null; provider: Provider | null;
  repairCode: string | null; qualityCode: string | null; serviceMode: string; inspectionFeePaise: number | null; location: BookingLocation;
  fuelType: string | null; diagnosticAnswers: Record<string, unknown> | null; diagnosticTranscript: QA[]; addOnCodes: string[]; scheduledAt: Date | null; proGender?: string | null;
  onDone: (booking: { _id: string; reference?: string }) => void;
}) {
  const [create, { isLoading }] = useCreateRepairBookingMutation();
  const signedIn = useAppSelector((st) => st.auth.isAuthenticated);
  const router = useRouter();
  const pathname = usePathname();
  // Arrived through this provider's own link (StorefrontPage kept the code): the server checks it is theirs.
  const [via, setVia] = useState<string | null>(null);
  useEffect(() => {
    const key = provider?.shopId ? `shop:${provider.shopId}` : provider?.workerId ? `worker:${provider.workerId}` : null;
    if (key) AsyncStorage.getItem(`zappy:via:${key}`).then(setVia).catch(() => setVia(null));
  }, [provider?.shopId, provider?.workerId]);
  const idempotencyKey = useMemo(() => `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, []);
  const [onSite, setOnSite] = useState<{ name: string; phone: string } | 'incomplete' | null>(null);
  const [tip, setTip] = useState(0);
  const inspectionOnly = serviceMode === 'diagnosis_only';
  // The grade they picked, with the server's full bill for it (shared/customer/repairBill).
  const chosen = chosenPrice(provider, qualityCode);
  const price = inspectionOnly ? inspectionFeePaise : chosen.pricePaise;
  const surge = useSurge({ kind: 'repair', vertical, serviceMode, loc: location, basePaise: price, skip: price == null });
  const { data: verticals } = useRepairVerticalsQuery(undefined);
  const terms = termsOf(vertical, (verticals as { items?: unknown[] } | undefined)?.items);

  async function book() {
    // Anyone can browse to here; signing in is asked only to confirm, and the flow's draft brings them straight back.
    if (!signedIn) { toast('Sign in to confirm. Your booking is saved.'); rememberReturn(pathname); router.push('/(auth)/login' as never); return; }
    if (onSite === 'incomplete') { toast.error('Add their name and mobile number, or untick "for someone else".'); return; }
    try {
      const res = await create({
        ...(onSite && { onSite }),
        vertical, brandCode: brand.code, modelCode: model.code, configurationCode: configuration?.code || null, fuelType: fuelType || null,
        problemCodes: [problem.code], addOnCodes,
        diagnosticFlowCode: diagnosis?.flowCode || null,
        diagnosticAnswers: diagnosticAnswers || diagnosticTranscript.length ? { raw: diagnosticAnswers || {}, transcript: diagnosticTranscript } : null,
        diagnosisSummary: diagnosis?.summary || '',
        repairCode: inspectionOnly ? null : repairCode || null,
        qualityCode: qualityCode || diagnosis?.recommendedQuality || null,
        serviceMode, workerId: provider?.workerId || null, shopId: provider?.shopId || null, zappyRecommended: !!provider?.zappyRecommended, via,
        location: { coordinates: [location.lng, location.lat], address: doorAddress(location) || 'Current location', landmark: (location.notes || '').slice(0, 150) },
        paymentMethod: 'cash', idempotencyKey,
        ...surge.bookingFields,
        ...(tip > 0 && { tipPaise: tip * 100 }),
        ...(scheduledAt && { scheduledAt: scheduledAt.toISOString(), slotLabel: slotLabel(scheduledAt) }),
        ...(proGender && { proGender }),
      }).unwrap();
      onDone(res.booking);
    } catch (err) {
      if (surgeChanged(err, surge.refetch)) { toast((err as { data: { error: string } }).data.error); return; }
      toast.error(errText(err, 'Could not create the booking. Try again.'));
    }
  }

  const rows: [string, string][] = [
    ...(bookedRows(terms, {
      device: deviceName(brand, model), option: model?.name, build: configuration?.name, problem: problem.name,
      repair: inspectionOnly ? 'Decided after inspection' : diagnosis?.recommendations?.[0]?.name || 'To be confirmed after diagnosis',
    }) as [string, string][]),
    ['Provider', provider?.name || 'Assigned for you'],
    ['Service', MODE_LABEL[serviceMode] || serviceMode],
    ['When', scheduledAt ? slotLabel(scheduledAt) : 'As soon as possible'],
  ];

  // The pros out near the customer, moving, and how soon the chosen one arrives (ride-app style).
  const eta = (provider as { arrivalMinutes?: number } | null)?.arrivalMinutes;
  return (
    <Shell>
      {serviceMode !== 'workshop' && typeof location?.lat === 'number' ? (
        <View style={styles.map}>
          <PickerMap lat={location.lat} lng={location.lng} readOnly etaLabel={eta != null ? `${Math.max(1, Math.round(eta))} min` : null} />
        </View>
      ) : null}
      <View style={[flow.card, styles.rows]}>
        <Text variant="caption" weight="bold" color={ink[500]}>{inspectionOnly ? 'YOUR INSPECTION' : `YOUR ${terms.job.toUpperCase()}`}</Text>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text variant="caption" color={ink[500]}>{k}</Text>
            <Text variant="bodySmall" weight="semibold" style={styles.value}>{v}</Text>
          </View>
        ))}
      </View>
      <RepairPriceCard inspectionOnly={inspectionOnly} price={price} bill={inspectionOnly ? null : chosen.bill} surgeQuote={surge.quote} surgePaise={surge.totalPaise} tip={tip} serviceMode={serviceMode} terms={terms} />
      {price != null ? <TipAtCheckout value={tip} onChange={setTip} /> : null}
      <SomeoneElse onChange={setOnSite} />
      <PendingFeeNotice />
      <PayMethodPicker cashNote={billWords(terms).cash(inspectionOnly)} />
      <Button label={inspectionOnly ? 'Book inspection' : 'Confirm booking'} icon={<Check size={16} color="#fff" />} loading={isLoading} onPress={book} fullWidth />
    </Shell>
  );
}

const styles = StyleSheet.create({
  map: { height: 190, borderRadius: 16, overflow: 'hidden' },
  rows: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  value: { flex: 1, textAlign: 'right' },
});
