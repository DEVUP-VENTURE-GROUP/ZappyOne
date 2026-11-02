/**
 * Services setup, the mirror image of the customer's booking flow (the
 * websites' ProviderRepairSetupPage). A customer walks brand → model →
 * heading → symptom; a provider walks the same catalog from the other side:
 *
 *   Brands → What you fix → Where → (Timings, shops) → Prices
 *
 * Every approved service has a tab: repairs have these steps; the rest (pet
 * care, helping) need nothing set here, and say so. Nothing is hardcoded:
 * brands, headings and repairs are the rows the customer screens read.
 * Every provider, shop or individual, sets its own prices.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import {
  useProviderOnboardingStatusQuery, useRepairWorkCatalogQuery, useRepairServiceAreasQuery, useRepairProviderPricingQuery,
} from '@zappy/core/api';
import { Text } from '../../components';
import { toast } from '../../components/Toast';
import { colors, ink, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { AreaStep } from '../components/setup/AreaStep';
import { BrandsStep } from '../components/setup/BrandsStep';
import { HoursStep } from '../components/setup/HoursStep';
import { MenuEditor } from '../components/menu/MenuEditor';
import { PetRateCard } from '../components/setup/PetRateCard';
import { HelpingRateCard } from '../components/setup/HelpingRateCard';
import { PricingStep } from '../components/setup/PricingStep';
import { ReadyService } from '../components/setup/ReadyService';
import { StepRail } from '../components/setup/StepRail';
import { WorkStep } from '../components/setup/WorkStep';
import { VERTICAL_LABEL, stepsFor, type SetupStep } from '../components/setup/setupFlow';

interface Enrolment { lineCode: string; status: string; line?: { name?: string; repairVertical?: string; domainCode?: string } }
/** The step before each one, for Back and Android's back button. */
const previousOf = (step: SetupStep, isShop: boolean, menu: boolean): SetupStep | undefined =>
  ((menu ? { area: 'menu', hours: 'area' } : { work: 'brands', area: 'work', hours: 'area', pricing: isShop ? 'hours' : 'area' }) as Partial<Record<SetupStep, SetupStep>>)[step];

export function ProviderRepairSetupPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: onboarding } = useProviderOnboardingStatusQuery();
  const isShop = onboarding?.providerKind === 'shop';
  const home = isShop ? '/shop' : '/worker';

  const others = useMemo(() => ((onboarding?.enrolments || []) as Enrolment[])
    .filter((e) => e.status === 'approved' && !e.line?.repairVertical)
    .map((e) => ({ key: `line:${e.lineCode}`, code: e.lineCode, domain: e.line?.domainCode || '', name: e.line?.name || e.lineCode.replace(/_/g, ' ') })), [onboarding]);
  const verticals: string[] = onboarding?.repairVerticals?.length ? onboarding.repairVerticals : (others.length ? [] : ['mobile']);
  const tabs = [...verticals, ...others.map((o) => o.key)];
  const [tab, setTab] = useState<string | null>(null);
  const active = tab && tabs.includes(tab) ? tab : tabs[0];
  const other = others.find((o) => o.key === active) || null;

  const [step, setStep] = useState<SetupStep>('brands');
  const [brandCodes, setBrandCodes] = useState<string[] | null>(null);
  const [cityCode, setCityCode] = useState('');

  // Every step shows what is really saved, read from the same data the step uses.
  const skip = !active || !!other;
  const { data: work } = useRepairWorkCatalogQuery({ vertical: active }, { skip });
  const { data: areaData } = useRepairServiceAreasQuery(active, { skip });
  const { data: priceData } = useRepairProviderPricingQuery(active, { skip });

  // Seed brands from what they already claim, so a return visit is not blank.
  useEffect(() => { if (work && brandCodes === null) setBrandCodes(work.brands || []); }, [work, brandCodes]);

  // Already set up: open on the prices (what people come back to see), not step one.
  const [landed, setLanded] = useState<string | null>(null);
  useEffect(() => {
    if (!work || landed === active) return;
    setLanded(active);
    if (work.menu) setStep('menu');
    else if (work.selectedCount && brandCodes?.length !== 0) setStep('pricing');
  }, [work, active, landed, brandCodes]);

  const done = useMemo(() => {
    const set = new Set<SetupStep>();
    if (brandCodes?.length) set.add('brands');
    if (work?.selectedCount) set.add('work');
    if ((areaData?.areas || []).some((a: { center?: { coordinates?: number[] }; pincodes?: string[] }) => a.center?.coordinates?.length === 2 || a.pincodes?.length)) set.add('area');
    if (onboarding?.profile?.hours?.length) set.add('hours');
    if (priceData?.pricing?.length) { set.add('pricing'); set.add('menu'); }
    return set;
  }, [brandCodes, work, areaData, priceData, onboarding]);

  const leave = useCallback(() => router.replace(home as never), [router, home]);
  const finish = useCallback(() => { toast.success("Setup saved. You're ready for jobs."); leave(); }, [leave]);

  // Android back steps back through the setup before leaving it.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const prev = !other ? previousOf(step, isShop, !!work?.menu) : undefined;
      if (prev) setStep(prev); else leave();
      return true;
    });
    return () => sub.remove();
  }, [step, other, isShop, leave, work?.menu]));

  function switchTab(t: string) { setTab(t); setBrandCodes(null); setStep('brands'); }

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.row}>
          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}><ArrowLeft size={18} color={ink[900]} /></Pressable>
          <View style={styles.flex}>
            <Text variant="body" weight="bold" numberOfLines={1}>{other ? other.name : `Set up ${VERTICAL_LABEL[active] || active || 'your services'}`}</Text>
            <Text variant="caption" color={ink[400]}>A few quick steps. You can come back any time.</Text>
          </View>
          <Pressable onPress={() => router.push('/provider/onboarding' as never)} accessibilityRole="button" accessibilityLabel="Services and verification" hitSlop={8} style={styles.back}>
            <ShieldCheck size={17} color={ink[700]} />
          </Pressable>
        </View>
        {tabs.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {tabs.map((t) => (
              <Pressable key={t} onPress={() => switchTab(t)} accessibilityRole="tab" accessibilityState={{ selected: active === t }} style={[styles.tab, active === t && styles.tabOn]}>
                <Text variant="caption" weight="bold" color={active === t ? '#fff' : ink[700]}>{VERTICAL_LABEL[t] || others.find((o) => o.key === t)?.name || t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {!other ? <StepRail steps={stepsFor(isShop, !!work?.menu)} current={step} done={done} onJump={setStep} /> : null}
      </View>

      <View style={styles.flex}>
        {other?.domain === 'pet_services' ? <PetRateCard category={other.code} /> : other ? <HelpingRateCard lineCode={other.code} fallback={<ReadyService name={other.name} isShop={isShop} onHours={() => router.push((isShop ? '/shop/profile' : '/worker/hours') as never)} />} /> : !active ? null : (
          <>
            {step === 'menu' ? <MenuEditor key={active} vertical={active} onNext={() => setStep('area')} /> : null}
            {step === 'brands' && brandCodes !== null && !work?.menu ? <BrandsStep key={active} vertical={active} selected={brandCodes} onChange={setBrandCodes} onNext={() => setStep('work')} /> : null}
            {step === 'work' ? <WorkStep key={active} vertical={active} cityCode={cityCode} brandCodes={brandCodes || []} onBack={() => setStep('brands')} onNext={() => setStep('area')} /> : null}
            {step === 'area' ? <AreaStep key={active} vertical={active} profile={onboarding?.profile} onBack={() => setStep(work?.menu ? 'menu' : 'work')} onNext={() => (isShop ? setStep('hours') : work?.menu ? finish() : setStep('pricing'))} onCity={setCityCode} /> : null}
            {step === 'hours' && isShop ? <HoursStep profile={onboarding?.profile} onBack={() => setStep('area')} onNext={() => (work?.menu ? finish() : setStep('pricing'))} /> : null}
            {step === 'pricing' ? <PricingStep key={active} vertical={active} isShop={isShop} onBack={() => setStep(isShop ? 'hours' : 'area')} onNext={finish} /> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  header: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 38, height: 38, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  tabs: { gap: 6 },
  tab: { minWidth: 110, alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.medium, backgroundColor: slate[100] },
  tabOn: { backgroundColor: ink[900] },
});
