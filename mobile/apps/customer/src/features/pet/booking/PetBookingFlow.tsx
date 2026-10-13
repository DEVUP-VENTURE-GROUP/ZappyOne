/**
 * One adaptive pet booking for every category (the website's PetBookingFlow):
 * pets → service → extras → when → where → who → confirm. A stay asks for
 * dates instead of a time, transport for a destination. Compatibility is
 * checked the moment a service is chosen, choices are saved on the phone, and
 * providers are always searched fresh.
 */
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLazyPetCompatibilityQuery, useMyPetsQuery, usePetProviderSearchMutation, usePetQuoteMutation, usePetVariantsQuery } from '@zappy/core/api';
import { clearDraft } from '@zappy/core/lib/drafts';
import { useAppSelector } from '@zappy/core/store/hooks';
import { useCheckoutDraft } from '@zappy/core/shared/useCheckoutDraft';
import { doorAddress } from '@zappy/core/shared/doorAddress';
import { Button, ScreenHeader, Text } from '@zappy/ui/components';
import { SlotPicker } from '@zappy/ui/components/booking/SlotPicker';
import { ResumeBanner } from '@zappy/ui/components/common/ResumeBanner';
import { toast } from '@zappy/ui/components/Toast';
import { useDraft, useFlowStep } from '@zappy/ui/lib/bookingFlow';
import { usePickLocation, type BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Pet } from '../profile/PetProfileSheet';
import { PetAddonsStep } from './PetAddonsStep';
import { modeOf, needsDates, needsTransport, type PetProvider, type PetQuote, type PetVariant } from './petBookingRules';
import { PetConfirmStep } from './PetConfirmStep';
import { PetLocationStep } from './PetLocationStep';
import { PetPickStep } from './PetPickStep';
import { PetProvidersStep } from './PetProvidersStep';
import { VariantStep } from './VariantStep';

export interface PetDraft { selectedPetIds?: string[]; variantByPet?: Record<string, string>; addonsByPet?: Record<string, string[]>; checkIn?: string; checkOut?: string; scheduledAt?: string | null; loc?: BookingLocation | null; dest?: BookingLocation | null; step?: string }

export function PetBookingFlow({ categoryCode, saved, draftKey, onStartOver }: { categoryCode: string; saved: PetDraft | null; draftKey: string; onStartOver: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const params = useLocalSearchParams<{ variant?: string }>();
  const exit = () => (router.canGoBack() ? router.back() : router.replace('/pet' as never));

  const { data: petsData } = useMyPetsQuery(undefined);
  const { data: variantsData } = usePetVariantsQuery({ categoryCode });
  const pets: Pet[] = petsData?.pets || [];
  const variants: PetVariant[] = variantsData?.variants || [];

  const [selected, setSelected] = useState<string[]>(saved?.selectedPetIds ?? []);
  const [variantByPet, setVariantByPet] = useState<Record<string, string>>(saved?.variantByPet ?? {});
  const [addonsByPet, setAddonsByPet] = useState<Record<string, string[]>>(saved?.addonsByPet ?? {});
  const [checkIn, setCheckIn] = useState(saved?.checkIn ?? '');
  const [checkOut, setCheckOut] = useState(saved?.checkOut ?? '');
  const [scheduledAt, setScheduledAt] = useState<Date | null>(saved?.scheduledAt ? new Date(saved.scheduledAt) : null);
  const [loc, setLoc] = useState<BookingLocation | null>(saved?.loc ?? null);
  const [dest, setDest] = useState<BookingLocation | null>(saved?.dest ?? null);
  const [provider, setProvider] = useState<PetProvider | null>(null);
  const pickLoc = usePickLocation(setLoc);
  const pickDest = usePickLocation(setDest);

  const [checkCompat] = useLazyPetCompatibilityQuery();
  const [getQuote, { data: quoteData, isLoading: quoting }] = usePetQuoteMutation();
  const [search, { data: found, isLoading: searching }] = usePetProviderSearchMutation();

  const chosenPets = pets.filter((p) => selected.includes(p._id));
  const variant = variants.find((v) => v.code === variantByPet[selected[0]]);
  const stay = needsDates(variant);
  const transport = needsTransport(variant);
  const mode = modeOf(variant);
  const [step, setStep, back, backTo] = useFlowStep('pets', { onExit: exit });

  useDraft(draftKey, {
    selectedPetIds: selected, variantByPet, addonsByPet, checkIn, checkOut, scheduledAt: scheduledAt?.toISOString() ?? null, loc, dest,
    step: step === 'providers' || step === 'confirm' ? 'location' : step,
  }, selected.length > 0);

  // A resume lands where it left off, provided that step still has what it needs.
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    const ok = saved?.step && saved.step !== 'pets' && (saved.step === 'variant' ? (saved.selectedPetIds || []).length : Object.keys(saved.variantByPet || {}).length);
    if (ok) { setStep(saved!.step!, { replace: true }); setResumed(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = () => selected.map((petId) => ({ petId, variantCode: variantByPet[petId], addonCodes: addonsByPet[petId] || [] })).filter((e) => e.variantCode);
  const place = () => (loc ? { type: 'Point', coordinates: [loc.lng, loc.lat], address: doorAddress(loc) } : null);

  async function pickVariant(v: PetVariant) {
    // Checked when choosing, not after a price is shown.
    for (const p of chosenPets) {
      const r = await checkCompat({ species: p.species, categoryCode, variantCode: v.code, size: p.size }).unwrap().catch(() => ({ allowed: true, reason: '' }));
      if (!r.allowed) { toast.error(`${p.name}: ${r.reason}`); return; }
    }
    setVariantByPet(Object.fromEntries(selected.map((id) => [id, v.code])));
  }

  // Opened from a showcase tile (?variant=…): chosen once the pets are picked, with the same check.
  const presetDone = useRef(false);
  useEffect(() => {
    const preset = variants.find((v) => v.code === params.variant);
    if (step !== 'variant' || presetDone.current || !preset || variantByPet[selected[0]]) return;
    presetDone.current = true;
    pickVariant(preset);
  }, [step, variants]); // eslint-disable-line react-hooks/exhaustive-deps

  async function quote() {
    try { await getQuote({ categoryCode, pets: entries(), checkInAt: checkIn || null, checkOutAt: checkOut || null, serviceLocation: place() }).unwrap(); }
    catch (err) { toast.error(errText(err, t('petBook.priceFailed', 'Could not price this. Try again.'))); }
  }
  async function find() {
    try {
      await search({ categoryCode, variantCode: variantByPet[selected[0]], serviceMode: mode, pets: entries(), serviceLocation: place(), checkInAt: checkIn || null, checkOutAt: checkOut || null, scheduledAt: scheduledAt?.toISOString() || null }).unwrap();
      setStep('providers');
    } catch (err) { toast.error(errText(err, t('petBook.findFailed', 'Could not find providers. Try again.'))); }
  }

  const toggleAddon = (petId: string, code: string) => setAddonsByPet((prev) => {
    const list = prev[petId] || [];
    return { ...prev, [petId]: list.includes(code) ? list.filter((c) => c !== code) : [...list, code] };
  });
  const afterAddons = (opts?: { replace?: boolean }) => setStep(stay || transport ? 'location' : 'schedule', opts);
  const quoteResult: PetQuote | undefined = quoteData?.quote;
  // Got as far as where: home's "Continue your booking" and one reminder push (jobs/checkout-draft).
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated);
  const draftDone = useCheckoutDraft('pet', ['location', 'providers', 'confirm'].includes(step) ? {
    title: categoryCode.replace(/_/g, ' '), step: step === 'confirm' ? 'Confirm' : 'Choose who',
    path: `/pet/book/${categoryCode}`, pricePaise: quoteResult?.totalPaise ?? null,
  } : null, signedIn);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={categoryCode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} onBack={back} />
      {resumed ? <ResumeBanner onStartOver={onStartOver} onDismiss={() => setResumed(false)} /> : null}
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        {step === 'pets' ? <PetPickStep pets={pets} selected={selected} onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} onContinue={() => setStep('variant')} /> : null}
        {step === 'variant' ? <VariantStep variants={variants} loaded={!!variantsData} species={chosenPets.map((p) => p.species)} chosen={selected.every((id) => variantByPet[id]) ? variantByPet[selected[0]] : undefined} onPick={pickVariant} onContinue={() => setStep('addons')} /> : null}
        {step === 'addons' ? <PetAddonsStep categoryCode={categoryCode} pets={chosenPets} addonsByPet={addonsByPet} onToggle={toggleAddon} onContinue={afterAddons} /> : null}
        {step === 'schedule' ? (
          <View style={styles.gap}>
            <Text variant="bodySmall" weight="bold" color={ink[500]}>{t('petBook.when', 'When?')}</Text>
            <SlotPicker value={scheduledAt} onChange={setScheduledAt} days={14} />
            <Button label={t('common.continue', 'Continue')} variant="secondary" disabled={!scheduledAt} onPress={() => setStep('location')} fullWidth />
          </View>
        ) : null}
        {step === 'location' ? (
          <PetLocationStep stay={stay} transport={transport} checkIn={checkIn} checkOut={checkOut} onCheckIn={setCheckIn} onCheckOut={setCheckOut}
            loc={loc} dest={dest} onPickLoc={() => pickLoc(loc)} onPickDest={() => pickDest(dest || loc)}
            quote={quoteResult} names={chosenPets.map((p) => p.name)} quoting={quoting} onQuote={quote} searching={searching} onFind={find} />
        ) : null}
        {step === 'providers' ? <PetProvidersStep result={found} categoryCode={categoryCode} loc={loc} onChangeLocation={() => backTo('location')} onPick={(p) => { setProvider(p); setStep('confirm'); }} /> : null}
        {step === 'confirm' && provider && loc ? (
          <PetConfirmStep categoryCode={categoryCode} serviceMode={mode} variantName={variant?.name} petNames={chosenPets.map((p) => p.name)} pets={entries()}
            provider={provider} quote={quoteResult} loc={loc} dest={dest} scheduledAt={scheduledAt} checkIn={checkIn} checkOut={checkOut}
            onBooked={(id) => { clearDraft(draftKey); draftDone(); router.replace(`/pet/bookings/${id}` as never); }} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  gap: { gap: spacing.md },
});
