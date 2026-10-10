/**
 * Where the provider works: a fixed pin (not where they happen to be), how far
 * around it they go, the pincodes they cover, and how they work. Jobs outside
 * the circle never reach them.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, MapPin, Minus, Plus } from 'lucide-react-native';
import { useRepairServiceAreasQuery, useUpsertRepairServiceAreaMutation } from '@zappy/core/api';
import { LoadingState, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { LocationPicker } from '../../../components/common/LocationPicker';
import { errText } from '../../../lib/feedback';
import { colors, ink, slate, success, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { StepShell } from './StepShell';
import { modesFor } from './setupFlow';

const MAX_KM = 20;   // past this the travel costs more than the repair

interface AreaForm { cityCode: string; radiusKm: number; pincodes: string; serviceModes: string[]; workshopAddress: string; center: number[] | null; centerAddress: string }
interface Profile { address?: { text?: string; location?: { coordinates?: number[] } } }

export function AreaStep({ vertical, profile, onBack, onNext, onCity }: { vertical: string; profile?: Profile; onBack: () => void; onNext: () => void; onCity: (city: string) => void }) {
  const { data, isLoading } = useRepairServiceAreasQuery(vertical);
  const [save, { isLoading: saving }] = useUpsertRepairServiceAreaMutation();
  const [form, setForm] = useState<AreaForm | null>(null);
  const [picking, setPicking] = useState(false);
  const existing = data?.areas?.[0];

  // A shop already told us where it is: start from its address, not a blank map.
  useEffect(() => {
    if (!data || form) return;
    const shopPin = profile?.address?.location?.coordinates?.length === 2 ? profile.address.location.coordinates : null;
    const shopAddress = profile?.address?.text || '';
    setForm({
      cityCode: existing?.cityCode || 'hyderabad',
      radiusKm: existing?.radiusKm || MAX_KM,
      pincodes: (existing?.pincodes || []).join(', '),
      serviceModes: existing?.serviceModes || ['doorstep'],
      workshopAddress: existing?.workshopAddress || shopAddress,
      center: existing?.center?.coordinates || shopPin,   // [lng, lat], as the server stores it
      centerAddress: existing?.workshopAddress || shopAddress,
    });
  }, [data, existing, form, profile]);

  if (isLoading || !form) return <LoadingState />;
  const set = (patch: Partial<AreaForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const needsWorkshop = form.serviceModes.some((m) => m === 'workshop' || m === 'pickup_repair');
  const toggleMode = (key: string) => set({ serviceModes: form.serviceModes.includes(key) ? form.serviceModes.filter((m) => m !== key) : [...form.serviceModes, key] });

  async function persist({ quiet = false } = {}) {
    const f = form!;
    if (!f.cityCode.trim()) { toast.error('Which city do you work in?'); return; }
    if (!f.serviceModes.length) { toast.error('Pick at least one way of working'); return; }
    // Without a pin the radius means nothing and no customer can reach them.
    if (!f.center) { toast.error('Set your shop location first'); return; }
    if (needsWorkshop && !f.workshopAddress.trim()) { toast.error('A workshop address is required for workshop or pickup work'); return; }
    const city = f.cityCode.trim().toLowerCase();
    try {
      await save({
        vertical, cityCode: city, center: f.center, radiusKm: f.radiusKm,
        pincodes: f.pincodes.split(',').map((s) => s.trim()).filter(Boolean), serviceModes: f.serviceModes, workshopAddress: f.workshopAddress,
      }).unwrap();
      onCity(city);
      if (!quiet) onNext();
    } catch (err) { if (!quiet) toast.error(errText(err, 'Could not save your area')); }
  }

  /** Back keeps what was filled in, when it is complete enough to save. */
  async function back() {
    const complete = form!.cityCode.trim() && form!.serviceModes.length && form!.center && (!needsWorkshop || form!.workshopAddress.trim());
    if (complete) await persist({ quiet: true });
    onBack();
  }

  const initial = form.center ? { lat: form.center[1], lng: form.center[0], address: form.centerAddress } : null;
  return (
    <>
      {picking ? (
        <LocationPicker title="Your shop location" initial={initial} onCancel={() => setPicking(false)}
          onConfirm={({ address, lat, lng }) => {
            // The shop address doubles as the drop-off address unless they wrote a different one.
            set({ center: [lng, lat], centerAddress: address, workshopAddress: form.workshopAddress || address });
            setPicking(false);
          }} />
      ) : null}
      <StepShell title="Where do you work?" hint="Pin your shop, then say how far around it you will go. Jobs outside that circle never reach you."
        onBack={back} onNext={() => persist()} busy={saving}>
        <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={[styles.pin, !form.center && styles.pinEmpty]}>
          <View style={[styles.pinIcon, { backgroundColor: form.center ? success[50] : zappy[600] }]}><MapPin size={17} color={form.center ? success[600] : '#fff'} /></View>
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="bold">{form.center ? 'Your shop location' : 'Set your shop location'}</Text>
            <Text variant="caption" color={ink[500]}>{form.center ? (form.centerAddress || 'Pin dropped on the map') : 'Drop a pin where your shop actually is. Everything below is measured from it.'}</Text>
          </View>
          <Text variant="caption" weight="bold" color={zappy[600]}>{form.center ? 'Change' : 'Set'}</Text>
        </Pressable>
        <Text variant="caption" color={ink[400]} style={styles.note}>This is a fixed address, not where you happen to be. Jobs are matched to your shop even when you are out.</Text>

        <View style={styles.card}>
          <Text variant="caption" weight="bold" color={ink[500]}>CITY</Text>
          <TextInput value={form.cityCode} onChangeText={(v) => set({ cityCode: v })} placeholder="e.g. hyderabad" placeholderTextColor={ink[400]} autoCapitalize="none" style={styles.input} />
          <View style={styles.between}>
            <Text variant="caption" weight="bold" color={ink[500]}>HOW FAR FROM THE SHOP</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => set({ radiusKm: Math.max(1, form.radiusKm - 1) })} accessibilityLabel="Less distance" hitSlop={6} style={styles.stepBtn}><Minus size={15} color={ink[700]} /></Pressable>
              <Text variant="bodySmall" weight="black" color={zappy[600]} style={styles.km}>{form.radiusKm} km</Text>
              <Pressable onPress={() => set({ radiusKm: Math.min(MAX_KM, form.radiusKm + 1) })} accessibilityLabel="More distance" hitSlop={6} style={styles.stepBtn}><Plus size={15} color={ink[700]} /></Pressable>
            </View>
          </View>
          <Text variant="caption" color={ink[400]}>Measured from your shop pin. Up to {MAX_KM} km: beyond that the travel costs more than the repair.</Text>
          <Text variant="caption" weight="bold" color={ink[500]}>PINCODES YOU COVER</Text>
          <TextInput value={form.pincodes} onChangeText={(v) => set({ pincodes: v })} placeholder="500081, 500084 (optional)" placeholderTextColor={ink[400]} keyboardType="numbers-and-punctuation" style={styles.input} />
        </View>

        <View style={styles.card}>
          <Text variant="caption" weight="bold" color={ink[500]}>HOW YOU WORK</Text>
          {modesFor(vertical).map((m) => {
            const on = form.serviceModes.includes(m.key);
            return (
              <Pressable key={m.key} onPress={() => toggleMode(m.key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.mode, on && styles.modeOn]}>
                <View style={[styles.box, on && styles.boxOn]}>{on ? <Check size={12} color="#fff" strokeWidth={3.5} /> : null}</View>
                <View style={styles.flex}><Text variant="bodySmall" weight="semibold">{m.label}</Text><Text variant="caption" color={ink[500]}>{m.hint}</Text></View>
              </Pressable>
            );
          })}
          {needsWorkshop ? (
            <>
              <Text variant="caption" weight="bold" color={ink[500]}>WORKSHOP ADDRESS</Text>
              <TextInput value={form.workshopAddress} onChangeText={(v) => set({ workshopAddress: v })} placeholder="Where customers drop devices off" placeholderTextColor={ink[400]} style={styles.input} />
            </>
          ) : null}
        </View>
      </StepShell>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  pin: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  pinEmpty: { borderColor: zappy[300], backgroundColor: zappy[50] },
  pinIcon: { width: 36, height: 36, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  note: { paddingHorizontal: 4 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.button },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  km: { minWidth: 52, textAlign: 'center' },
  mode: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200] },
  modeOn: { borderColor: zappy[500], backgroundColor: zappy[50] },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: slate[300], alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: zappy[600], borderColor: zappy[600] },
});
