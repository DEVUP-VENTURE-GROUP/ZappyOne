/**
 * Provider onboarding, the first thing a shop owner or technician does
 * (the websites' ProviderOnboardingPage):
 *
 *   your services → what kind of work → which services → prove you can do them
 *
 * Everything shown is drawn from the API: domains, the services inside them and
 * the documents each demands are rows an operator edits. The back arrow and
 * Android's back button step back through the flow before leaving it.
 */
import { useCallback, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useProviderOnboardingStatusQuery } from '@zappy/core/api';
import { LoadingState, Text } from '../../components';
import { colors, ink, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { OnboardingSummary, type OnboardingStatus } from '../components/onboarding/OnboardingSummary';
import { DomainStep, type Domain } from '../components/onboarding/DomainStep';
import { LineStep } from '../components/onboarding/LineStep';
import { VerifyStep } from '../components/onboarding/VerifyStep';
import { RequestServiceSheet } from '../components/onboarding/RequestServiceSheet';

type Step = 'summary' | 'domain' | 'line' | 'verify';
const PREVIOUS: Record<Step, Step | null> = { summary: null, domain: 'summary', line: 'domain', verify: 'summary' };

export function ProviderOnboardingPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useProviderOnboardingStatusQuery();
  const status = data as OnboardingStatus | undefined;
  const [step, setStep] = useState<Step>('summary');
  const [domain, setDomain] = useState<Domain | null>(null);
  const [lineCode, setLineCode] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const go = useCallback((next: Step) => { setStep(next); scroll.current?.scrollTo({ y: 0, animated: false }); }, []);
  const back = useCallback(() => {
    const prev = PREVIOUS[step];
    if (prev) { go(prev); return true; }
    if (router.canGoBack()) router.back(); else router.replace('/worker' as never);
    return true;
  }, [step, go, router]);

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [back]));

  const titles: Record<Step, string> = {
    summary: 'Your services',
    domain: 'What kind of work do you do?',
    line: domain?.name || 'Choose a service',
    verify: 'Verification',
  };
  const subtitle = status?.providerKind === 'shop' ? status?.profile?.businessName : status?.profile?.name;

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}><ArrowLeft size={18} color={ink[900]} /></Pressable>
        <View style={styles.flex}>
          <Text variant="body" weight="bold" numberOfLines={1}>{titles[step]}</Text>
          {subtitle ? <Text variant="caption" color={ink[400]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      {isLoading ? <LoadingState /> : (
        <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: insets.bottom }} keyboardShouldPersistTaps="handled">
          {step === 'summary' && status ? (
            <OnboardingSummary status={status} onAddService={() => go('domain')} onOpenEnrolment={(e) => { setLineCode(e.lineCode); go('verify'); }} />
          ) : null}
          {step === 'domain' ? <DomainStep onPick={(d) => { setDomain(d); go('line'); }} /> : null}
          {step === 'line' && domain ? (
            <LineStep domain={domain} onPick={(l) => { setLineCode(l.code); go('verify'); }} onRequest={() => setShowRequest(true)} />
          ) : null}
          {step === 'verify' && lineCode ? <VerifyStep lineCode={lineCode} onDone={() => go('summary')} /> : null}
        </ScrollView>
      )}
      {showRequest ? <RequestServiceSheet domain={domain} onClose={() => setShowRequest(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 38, height: 38, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
});
