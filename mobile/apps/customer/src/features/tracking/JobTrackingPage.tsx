/**
 * Live tracking, one page for every kind of job (the website's
 * JobTrackingPage): the map while someone travels, the pro's card, the
 * arrival promise, the start code, boost while searching, tip and repeat once
 * done, the timeline and live feed, the summary, and help / cancel / SOS.
 * Each kind passes the common `job` shape and its own `extras`.
 */
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, Headphones, Repeat2, ShieldCheck, X } from 'lucide-react-native';
import { useJobOptionsQuery } from '@zappy/core/api';
import { useTrackingFeed } from '@zappy/core/hooks/useTrackingFeed';
import { feedCopy, firstNameOf, stepsFor } from '@zappy/core/shared/trackingSteps';
import { Button, Text } from '@zappy/ui/components';
import { ConnectionBanner } from '@zappy/ui/components/common/ConnectionBanner';
import { JobChat } from '@zappy/ui/components/jobs/JobChat';
import { callNumber } from '@zappy/ui/lib/openLink';
import { LiveTrackingMap } from '@zappy/ui/maps/LiveTrackingMap';
import { mapsAvailable } from '@zappy/ui/lib/maps';
import { colors, ink, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { CancelSheet } from './cards/CancelSheet';
import { JobBoostCard } from './cards/JobBoostCard';
import { JobTipCard } from './cards/JobTipCard';
import { ProviderStatusNotes } from './cards/ProviderStatusNotes';
import { RepeatCard } from './cards/RepeatCard';
import { SosSheet } from './cards/SosSheet';
import { StartCodeCard } from './cards/StartCodeCard';
import { ActivityFeed } from './redesign/ActivityFeed';
import { BookingSummary } from './redesign/BookingSummary';
import { PremiumTimeline } from './redesign/PremiumTimeline';
import { ProofPhoto } from './redesign/ProofPhoto';
import { RatingPanel } from './redesign/RatingPanel';
import { SearchingHero } from './redesign/SearchingHero';
import { TrackingHeader } from './redesign/TrackingHeader';
import { WorkerRichCard } from './redesign/WorkerRichCard';
import type { TrackedJob } from './types';
import { useStatusNotice } from './useStatusNotice';

const NEEDS_YOU = ['CUSTOMER_APPROVAL_PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'APPROVAL_REQUIRED'];

export function JobTrackingPage({ job, extras = null, startCode = null, cancel = null, onRate, onSOS, rebookHref = null }: {
  job: TrackedJob; extras?: React.ReactNode; startCode?: string | null; cancel?: { run: (reason: string) => Promise<void> } | null;
  onRate?: (stars: number) => void; onSOS?: () => Promise<void>; rebookHref?: string | null;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const status = job.status;

  const optionsOn = ['repair', 'pet', 'helping'].includes(job.kind) && (!job.terminal || status === 'completed');
  const { data: options, isFetching: optionsLoading, refetch: refetchOptions } = useJobOptionsQuery({ id: job.id, status }, { skip: !optionsOn });

  const feed = useTrackingFeed(job.kind === 'order' ? null : job.id, { enabled: Boolean(job.trip), live: !job.terminal });
  const eta = feed.etaMinutes;
  const steps = useMemo(() => stepsFor(job.noun), [job.noun]);
  const activeStepIdx = steps.findIndex((s: { key: string }) => s.key === status);
  const timesByStatus = useMemo(() => Object.fromEntries(job.history.map((h) => [h.stage, h.at])), [job.history]);
  const firstName = firstNameOf(job.provider?.name);
  const feedEvents = useMemo(() => job.history
    .map((h) => ({ status: h.stage, at: h.at, text: feedCopy(h.stage, firstName, job.noun) as string }))
    .filter((e) => e.text)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [job.history, firstName, job.noun]);

  useStatusNotice(status, NEEDS_YOU.includes(job.rawStatus || ''), { name: job.provider?.name, rating: job.provider?.rating, jobs: job.provider?.jobs, eta });

  const target = job.trip?.to || (job.place.lat != null && job.place.lng != null ? { lat: job.place.lat, lng: job.place.lng } : null);
  const showMap = mapsAvailable && !job.terminal && ['assigned', 'on_the_way', 'arrived'].includes(status) && !!target;
  const stopped = status === 'cancelled' || status === 'failed';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/orders' as never));

  return (
    <View style={styles.page}>
      <TrackingHeader job={job} eta={eta} onBack={back} onSOS={() => setSosOpen(true)} onSupport={() => router.push('/support' as never)} />
      <ScrollView ref={scroll} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 180 }]}>
        {showMap && target ? (
          <View style={styles.map}>
            <LiveTrackingMap orderId={job.id} pickupLat={target.lat} pickupLng={target.lng} initialWorkerLocation={feed.workerLocation} style={StyleSheet.absoluteFill} />
          </View>
        ) : null}
        {status === 'searching' ? <SearchingHero /> : null}
        {job.provider && !job.terminal ? (
          <WorkerRichCard job={job} eta={eta}
            onCall={job.provider.phone ? () => callNumber(job.provider!.phone!) : undefined}
            onChat={job.kind !== 'order' ? () => setChatOpen(true) : undefined}
            onLive={showMap ? () => scroll.current?.scrollTo({ y: 0, animated: true }) : undefined} />
        ) : null}
        <ProviderStatusNotes jobId={job.id} noun={job.noun} options={options} hasProvider={!!job.provider} live={!job.terminal} onChanged={refetchOptions} />
        <StartCodeCard jobKey={`${job.kind}:${job.id}`} code={startCode} stage={status} noun={job.noun} />
        {!job.provider && !job.terminal ? <JobBoostCard jobId={job.id} boost={options?.boost} since={job.createdAt} noun={job.noun} onBoosted={refetchOptions} /> : null}
        {extras}
        {['repair', 'helping'].includes(job.kind) && status === 'completed' ? <RepeatCard jobId={job.id} noun={job.noun === 'helper' ? 'task' : 'booking'} /> : null}
        {status === 'completed' || options?.tip?.beforePayment ? <JobTipCard jobId={job.id} tip={options?.tip} name={firstName || null} onTipped={refetchOptions} /> : null}
        {!stopped ? <PremiumTimeline steps={steps} activeStepIdx={activeStepIdx} timesByStatus={timesByStatus} /> : null}
        {!stopped ? <ActivityFeed events={feedEvents} live={!job.terminal} /> : null}
        {stopped ? (
          <View style={[styles.card, styles.center]}>
            <Text variant="heading3" weight="bold">{status === 'cancelled' ? 'Booking cancelled' : 'This could not be completed'}</Text>
            <Text variant="bodySmall" color={ink[500]} style={styles.centerText}>{job.statusLabel || 'It is no longer being tracked.'}</Text>
          </View>
        ) : null}
        <BookingSummary job={job} />
        {status === 'completed' && job.proofs.length ? (
          <View style={styles.card}>
            <View style={styles.inline}><CheckCircle size={15} color={success[600]} /><Text variant="bodySmall" weight="bold">Photos of the work</Text></View>
            <View style={styles.photos}>{job.proofs.map((url, i) => <View key={url + i} style={job.proofs.length === 1 ? styles.full : styles.half}><ProofPhoto url={url} index={i} /></View>)}</View>
          </View>
        ) : null}
        {!job.terminal ? <View style={[styles.inline, styles.trust]}><ShieldCheck size={14} color={success[600]} /><Text variant="caption" weight="semibold" color={ink[500]}>Payment protected · Verified professionals</Text></View> : null}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.base }]}>
        {status === 'completed' && onRate ? <RatingPanel onRate={onRate} /> : null}
        {job.terminal ? (
          <>
            {rebookHref && status === 'completed' ? <Button label="Book again" icon={<Repeat2 size={18} color="#fff" />} onPress={() => router.push(rebookHref as never)} fullWidth /> : null}
            <Button label="Back to home" variant={rebookHref && status === 'completed' ? 'outline' : 'primary'} onPress={() => router.replace('/' as never)} fullWidth />
          </>
        ) : (
          <>
            <Button label="Get help" variant="outline" icon={<Headphones size={18} color={ink[700]} />} onPress={() => router.push('/support' as never)} fullWidth />
            {cancel ? <Button label="Cancel booking" variant="dangerGhost" icon={<X size={16} color={ink[500]} />} onPress={() => { setCancelOpen(true); if (optionsOn) refetchOptions(); }} fullWidth /> : null}
          </>
        )}
      </View>

      {cancel ? <CancelSheet visible={cancelOpen} onClose={() => setCancelOpen(false)} quote={options?.cancel} loading={optionsLoading} quoteNeeded={optionsOn} reasons={options?.reasons || []} onCancel={cancel.run} /> : null}
      <SosSheet visible={sosOpen} onClose={() => setSosOpen(false)} onAlert={onSOS} />
      {chatOpen ? <JobChat jobId={job.id} title={job.provider?.name || `Your ${job.noun}`} onClose={() => setChatOpen(false)} /> : null}
      <ConnectionBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  map: { height: 300, borderRadius: radius.large, overflow: 'hidden', backgroundColor: colors.border },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trust: { justifyContent: 'center', paddingTop: 4 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  full: { width: '100%' },
  half: { width: '48%' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: spacing.sm, paddingHorizontal: spacing.base, paddingTop: spacing.md, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
});
