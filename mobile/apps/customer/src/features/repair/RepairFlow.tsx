/**
 * The repair booking, step by step (the website's RepairFlow controller). One
 * engine for every vertical: the catalog decides which steps exist, a step with
 * nothing to ask records itself as skipped and hands over, progress is saved on
 * the phone, and the provider and price are always chosen fresh.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRepairBrandsQuery, useRepairModelsQuery, useRepairPricePreviewQuery, useRepairProductTypesQuery } from '@zappy/core/api';
import { clearDraft } from '@zappy/core/lib/drafts';
import { useAppSelector } from '@zappy/core/store/hooks';
import { chosenPrice, totalOf } from '@zappy/core/shared/repairBill';
import { useCheckoutDraft } from '@zappy/core/shared/useCheckoutDraft';
import { groupItems, itemFrom } from '@zappy/core/shared/repairBasket';
import { WhenChooser, slotLabel } from '@zappy/ui/components/booking/SlotPicker';
import { BasketBar } from './basket/BasketBar';
import { GroupCheckout } from './basket/GroupCheckout';
import { useRepairBasket } from './basket/useRepairBasket';
import { ResumeBanner } from '@zappy/ui/components/common/ResumeBanner';
import { useDraft, useFlowStep } from '@zappy/ui/lib/bookingFlow';
import { useBookingLocation } from '@zappy/ui/lib/bookingLocation';
import { colors } from '@zappy/ui/theme/colors';
import { AddOnsStep } from './flow/AddOnsStep';
import { BrandStep, type Coded } from './flow/BrandStep';
import { ConfigurationStep } from './flow/ConfigurationStep';
import { ConfirmStep } from './flow/ConfirmStep';
import { DeviceTypeStep } from './flow/DeviceTypeStep';
import { DiagnoseStep, type Diagnosis, type QA } from './flow/DiagnoseStep';
import { FamilyStep } from './flow/FamilyStep';
import { Spinner, StepHeader } from './flow/FlowChrome';
import { FuelStep } from './flow/FuelStep';
import { ModeStep } from './flow/ModeStep';
import { ModelStep, type Model } from './flow/ModelStep';
import { ProblemStep } from './flow/ProblemStep';
import { ProviderStep } from './flow/ProviderStep';
import { FUEL_LABELS, buildSteps, stepTitles, type Provider } from './flow/repairRules';

export interface RepairDraft {
  brand?: Coded | null; productType?: Coded | null; family?: Coded | null; model?: Model | null; configuration?: Coded | null; fuelType?: string | null;
  problem?: Coded | null; diagnosis?: Diagnosis | null; diagnosticAnswers?: Record<string, unknown> | null; diagnosticTranscript?: QA[];
  serviceMode?: string; skipped?: string[]; step?: string;
}

export function RepairFlow({ vertical, saved, draftKey, onStartOver, onAddAnother }: { vertical: string; saved: RepairDraft | null; draftKey: string; onStartOver: () => void; onAddAnother: (t: { vertical: string; path: string }) => void }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ problem?: string; brand?: string; model?: string }>();
  const { location, pick } = useBookingLocation();
  const [pinConfirmed, setPinConfirmed] = useState(false);
  const exit = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/' as never)), [router]);

  const { data: typeData, isLoading: typesLoading } = useRepairProductTypesQuery(vertical);
  const deep = (typeData?.productTypes || []).length > 0;
  const steps = useMemo(() => buildSteps(deep), [deep]);

  const [presetProblem, setPresetProblem] = useState<string | null>(params.problem || null);
  const [skipped, setSkipped] = useState(() => new Set(saved?.skipped || []));
  const [brand, setBrand] = useState<Coded | null>(saved?.brand ?? null);
  const [productType, setProductType] = useState<Coded | null>(saved?.productType ?? null);
  const [family, setFamily] = useState<Coded | null>(saved?.family ?? null);
  const [model, setModel] = useState<Model | null>(saved?.model ?? null);
  const [configuration, setConfiguration] = useState<Coded | null>(saved?.configuration ?? null);
  const [fuelType, setFuelType] = useState<string | null>(saved?.fuelType ?? null);
  const [problem, setProblem] = useState<Coded | null>(saved?.problem ?? null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(saved?.diagnosis ?? null);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<Record<string, unknown> | null>(saved?.diagnosticAnswers ?? null);
  const [diagnosticTranscript, setDiagnosticTranscript] = useState<QA[]>(saved?.diagnosticTranscript ?? []);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [repairCode, setRepairCode] = useState<string | null>(null);
  const [qualityCode, setQualityCode] = useState<string | null>(null);
  const [addOnCodes, setAddOnCodes] = useState<string[]>([]);
  const [serviceMode, setServiceMode] = useState(saved?.serviceMode ?? 'doorstep');
  const [when, setWhen] = useState<Date | null>(null);

  const [step, setStep, , backTo] = useFlowStep('brand', { onExit: exit });

  useDraft(draftKey, {
    brand, productType, family, model, configuration, fuelType, problem, diagnosis, diagnosticAnswers, diagnosticTranscript, serviceMode,
    skipped: [...skipped], step: step === 'addons' || step === 'confirm' ? 'provider' : step,
  }, !!brand);
  // Got as far as choosing who does it: home's "Continue your booking" and one
  // reminder push can bring them back (jobs/checkout-draft), on any device.
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated);
  // Several vehicles or devices in one visit (basket/): the others waiting, and this one as an item.
  const basket = useRepairBasket();
  const currentItem = useMemo(() => itemFrom({ vertical, brand, model, configuration, fuelType: fuelType || '', problem, diagnosis, qualityCode }),
    [vertical, brand, model, configuration, fuelType, problem, diagnosis, qualityCode]);
  const groupMode = basket.items.length > 0 && !!currentItem && serviceMode !== 'diagnosis_only';
  const late = !!problem && ['provider', 'addons', 'confirm'].includes(step);
  const draftDone = useCheckoutDraft('repair', late ? {
    title: problem.name || 'Repair', step: step === 'confirm' ? 'Confirm' : 'Choose who',
    path: `/repair${vertical === 'mobile' ? '' : `/${vertical.replace(/_/g, '-')}`}`,
    pricePaise: provider ? totalOf(chosenPrice(provider, qualityCode)) : null,
  } : null, signedIn);

  // A step opens only with what it needs; the provider and price are never restored.
  const NEEDS: Record<string, unknown> = {
    type: brand, family: brand, model: brand, config: model, fuel: model, problem: model, diagnose: problem, mode: problem, provider: problem,
    addons: provider, confirm: provider || (serviceMode === 'diagnosis_only' && problem),
  };
  const valid = (s: string) => steps.includes(s) && (!(s in NEEDS) || !!NEEDS[s]);

  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (typesLoading || !saved?.step || saved.step === 'brand' || !valid(saved.step)) return;
    setStep(saved.step, { replace: true });
    setResumed(true);
  }, [typesLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebook (?brand=…&model=…&problem=…): the same device from the catalog, then straight to the problem.
  const rebooking = !!params.brand && !brand;
  const { data: rbBrands } = useRepairBrandsQuery(vertical, { skip: !rebooking });
  const { data: rbModels } = useRepairModelsQuery(
    { vertical, brandCode: params.brand, q: (params.model || '').replace(`${params.brand}-`, '').replace(/-/g, ' ') },
    { skip: !rebooking || !params.model },
  );
  useEffect(() => {
    if (!rebooking || !rbBrands) return;
    const b = (rbBrands.brands || []).find((x: Coded) => x.code === params.brand);
    if (!b) return;
    if (params.model && !rbModels) return;
    const m = params.model ? (rbModels?.models || []).find((x: Model) => x.code === params.model) : null;
    setBrand(b);
    if (m) { setModel(m); setStep('problem', { replace: true }); } else setStep('model', { replace: true });
  }, [rebooking, rbBrands, rbModels]); // eslint-disable-line react-hooks/exhaustive-deps

  // The inspection fee is ZappyOne's (admin config): read from the price preview, null until known.
  const previewRepair = diagnosis?.primaryRepairCode || diagnosis?.recommendations?.[0]?.repairCode;
  const { data: preview } = useRepairPricePreviewQuery({ vertical, repairCode: previewRepair || undefined, brandCode: brand?.code, modelCode: model?.code, serviceMode: 'diagnosis_only' });
  const inspectionFeePaise: number | null = preview ? (preview.estimate?.totalPaise ?? 0) : null;

  /** The step `delta` away, walking past steps this catalog had nothing to show for. */
  const stepFrom = (from: string, delta: number) => {
    let j = steps.indexOf(from) + delta;
    while (j > 0 && j < steps.length && skipped.has(steps[j])) j += delta;
    return j < 0 ? null : steps[Math.min(j, steps.length - 1)];
  };
  const next = (from: string, opts?: { replace?: boolean }) => { const s = stepFrom(from, 1); if (s) setStep(s, opts); };
  const back = () => { const prev = stepFrom(step, -1); if (prev) backTo(prev); else exit(); };

  /** A step with nothing in it records itself and hands over; replaced, so Back never lands on it. */
  const skip = useCallback((name: string) => {
    setSkipped((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));
    setStep((current) => steps[Math.min(steps.indexOf(current) + 1, steps.length - 1)], { replace: true });
  }, [steps, setStep]);
  const skipFamily = useCallback(() => skip('family'), [skip]);
  const skipConfig = useCallback(() => skip('config'), [skip]);
  const skipAddOns = useCallback(() => skip('addons'), [skip]);

  // One fuel is not a question; none means the vertical does not ask.
  const modelFuels = useMemo(() => (model?.fuelTypes || []).map((c) => ({ code: c, name: FUEL_LABELS[c] || c })), [model]);
  useEffect(() => {
    if (step !== 'fuel') return;
    if (modelFuels.length === 1) { setFuelType(modelFuels[0].code); skip('fuel'); }
    else if (!modelFuels.length) { setFuelType(null); skip('fuel'); }
  }, [step, modelFuels, skip]);

  const pickProvider = (p: Provider | null, code: string | undefined, quality: string | null) => {
    setProvider(p); setRepairCode(code || null); setQualityCode(quality);
    if (serviceMode === 'diagnosis_only') { setSkipped((prev) => (prev.has('addons') ? prev : new Set(prev).add('addons'))); setStep('confirm'); }
    else if (skipped.has('addons')) { setSkipped((prev) => { const n = new Set(prev); n.delete('addons'); return n; }); setStep('addons'); }
    else next('provider');
  };

  if (typesLoading) return <View style={styles.page}><Spinner /></View>;
  const titles = stepTitles(vertical, brand?.name, serviceMode);
  const deviceLabel = [brand?.name, model?.name].filter(Boolean).join(' ');

  return (
    <View style={styles.page}>
      <StepHeader steps={steps} step={step} skipped={skipped} onBack={back} title={titles[step]} subtitle={configuration?.name || deviceLabel || brand?.name} />
      {resumed ? <ResumeBanner onStartOver={onStartOver} onDismiss={() => setResumed(false)} /> : null}
      {step === 'brand' ? <BrandStep vertical={vertical} onPick={(b) => { setBrand(b); next('brand'); }} onAuto={(b) => { setBrand(b); skip('brand'); }} /> : null}
      {step === 'type' ? <DeviceTypeStep vertical={vertical} brand={brand} onPick={(t) => { setProductType(t); next('type'); }} onAuto={(t) => { setProductType(t); skip('type'); }} /> : null}
      {step === 'family' && brand ? <FamilyStep vertical={vertical} brand={brand} productType={productType} onPick={(f) => { setFamily(f); next('family'); }} onSkip={skipFamily} /> : null}
      {step === 'model' && brand ? <ModelStep vertical={vertical} deep={deep} brand={brand} productType={productType} family={family} onPick={(m) => { setModel(m); next('model'); }} onAuto={(m) => { setModel(m); skip('model'); }} /> : null}
      {step === 'config' && model ? <ConfigurationStep vertical={vertical} model={model} onPick={(c) => { setConfiguration(c); next('config'); }} onSkip={skipConfig} /> : null}
      {step === 'fuel' ? <FuelStep model={model} fuels={modelFuels} onPick={(f) => { setFuelType(f.code); next('fuel'); }} /> : null}
      {step === 'problem' && model ? <ProblemStep vertical={vertical} model={model} productType={productType} fuelType={fuelType} presetCode={presetProblem} onPick={(p) => { setPresetProblem(null); setProblem(p); next('problem'); }} /> : null}
      {step === 'diagnose' && problem ? (
        <DiagnoseStep vertical={vertical} problem={problem} onResolved={(d, raw, qa) => {
          setDiagnosis(d); setDiagnosticAnswers(raw || null); setDiagnosticTranscript(qa || []);
          // No questions were asked: the step was never really seen, so Back skips it.
          next('diagnose', { replace: !(qa || []).length });
        }} />
      ) : null}
      {step === 'mode' ? <ModeStep diagnosis={diagnosis} inspectionFeePaise={inspectionFeePaise} onPick={(m) => { setServiceMode(m); next('mode'); }} /> : null}
      {step === 'provider' && serviceMode !== 'diagnosis_only' ? (
        <BasketBar vertical={vertical} current={currentItem} count={basket.items.length}
          onAddAnother={(t) => { basket.add(currentItem); onAddAnother(t); }}
          onAddSuggestion={(s) => basket.add(itemFrom({ vertical, brand, model, configuration, fuelType: fuelType || '', problem, diagnosis, repairCode: s.repairCode, repairName: s.name }))} />
      ) : null}
      {step === 'provider' && groupMode ? (
        <>
          <WhenChooser value={when} onChange={setWhen} />
          <GroupCheckout items={groupItems(basket.items, currentItem)} shown={[...basket.items, currentItem].filter(Boolean)}
            location={location} serviceMode={serviceMode} scheduledAt={when} slotLabel={when ? slotLabel(when) : ''}
            onRemove={(i) => basket.remove(i)}
            onBooked={(g) => { basket.clear(); clearDraft(draftKey); draftDone(); router.replace(`/repair/groups/${g._id}` as never); }} />
        </>
      ) : null}
      {step === 'provider' && !groupMode ? (
        <ProviderStep vertical={vertical} diagnosis={diagnosis} model={model} brand={brand} configuration={configuration} problem={problem}
          location={location} serviceMode={serviceMode} pinConfirmed={pinConfirmed} onPinConfirmed={() => setPinConfirmed(true)}
          onChangeLocation={() => { setPinConfirmed(true); pick(); }} scheduledAt={when} onWhen={(t) => { setWhen(t); setProvider(null); }}
          onInspectInstead={() => setServiceMode('diagnosis_only')} onPick={pickProvider} />
      ) : null}
      {step === 'addons' ? (
        <AddOnsStep vertical={vertical} provider={provider} repairCode={repairCode} qualityCode={qualityCode} brandCode={brand?.code} modelCode={model?.code}
          serviceMode={serviceMode} selected={addOnCodes} onContinue={() => next('addons')} onSkipStep={skipAddOns}
          onToggle={(code) => setAddOnCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))} />
      ) : null}
      {step === 'confirm' && brand && model && problem && location ? (
        <ConfirmStep vertical={vertical} brand={brand} model={model} configuration={configuration} problem={problem} diagnosis={diagnosis}
          provider={provider} repairCode={repairCode} qualityCode={qualityCode} serviceMode={serviceMode} inspectionFeePaise={inspectionFeePaise}
          location={location} fuelType={fuelType} diagnosticAnswers={diagnosticAnswers} diagnosticTranscript={diagnosticTranscript}
          addOnCodes={addOnCodes} scheduledAt={when}
          onDone={(b) => { clearDraft(draftKey); draftDone(); router.replace(`/repair/bookings/${b._id}` as never); }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background } });
