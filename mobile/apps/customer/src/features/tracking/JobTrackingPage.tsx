/**
 * Live tracking, one page for every kind of job (the website's JobTrackingPage), laid out as Urban Company does:
 * the map while someone travels, one headline with the start code, the pro, updates, booking details, the promise and cancel.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookedCelebration } from '@zappy/ui/components/common/BookedCelebration';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeIndianRupee, Clock, Headphones, MailPlus, Repeat2, ShieldCheck, UserPlus } from 'lucide-react-native';
import { useAccountMeQuery, useJobOptionsQuery, useShareJobMutation } from '@zappy/core/api';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useTrackingFeed } from '@zappy/core/hooks/useTrackingFeed';
import { feedCopy, firstNameOf } from '@zappy/core/shared/trackingSteps';
import { Button, Text } from '@zappy/ui/components';
import { ConnectionBanner } from '@zappy/ui/components/common/ConnectionBanner';
import { JobChat } from '@zappy/ui/components/jobs/JobChat';
import { callNumber } from '@zappy/ui/lib/openLink';
import { LiveTrackingMap } from '@zappy/ui/maps/LiveTrackingMap';
import { mapsAvailable } from '@zappy/ui/lib/maps';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { CancelSheet } from './cards/CancelSheet';
import { EditPlaceSheet } from './cards/EditPlaceSheet';
import { ContactSheet } from './cards/ContactSheet';
import { AddServices } from './redesign/AddServices';
import { PayPro } from './redesign/PayPro';
import { JobBoostCard } from './cards/JobBoostCard';
import { SlowSearchCard } from './cards/SlowSearchCard';
import { JobTipCard } from './cards/JobTipCard';
import { ProviderStatusNotes } from './cards/ProviderStatusNotes';
import { RepeatCard } from './cards/RepeatCard';
import { SosSheet } from './cards/SosSheet';
import { StartCodeCard } from './cards/StartCodeCard';
import { ActivityFeed } from './redesign/ActivityFeed';
import { BookingSummary } from './redesign/BookingSummary';
import { ProofPhoto } from './redesign/ProofPhoto';
import { RatingPanel } from './redesign/RatingPanel';
import { SearchingHero } from './redesign/SearchingHero';
import { RescheduleCancel } from './redesign/RescheduleCancel';
import { Row, Section } from './redesign/Section';
import { StatusBlock } from './redesign/StatusBlock';
import { TrackingHeader } from './redesign/TrackingHeader';
import { WorkerRichCard } from './redesign/WorkerRichCard';
import type { TrackedJob } from './types';
import { useStatusNotice } from './useStatusNotice';

const NEEDS_YOU = ['CUSTOMER_APPROVAL_PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'APPROVAL_REQUIRED'];
const clock = (d: string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function JobTrackingPage({ job, extras = null, startCode = null, codeStage = null, cancel = null, onRate, onSOS, rebookHref = null }: {
  job: TrackedJob; extras?: React.ReactNode; startCode?: string | null; codeStage?: string | null; cancel?: { run: (reason: string) => Promise<void>; note?: string } | null;
  onRate?: (stars: number) => void; onSOS?: () => Promise<void>; rebookHref?: string | null;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sosOpen, setSosOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editPlace, setEditPlace] = useState(false);
  const [editContact, setEditContact] = useState(false);
  // Opened straight from Confirm (?booked=1): the booking-confirmed moment plays over tracking once.
  const { booked } = useLocalSearchParams<{ booked?: string }>();
  const [celebrate, setCelebrate] = useState(booked === '1');
  const status = job.status;
  const [shareJob] = useShareJobMutation();
  const { data: acct } = useAccountMeQuery(undefined);

  const optionsOn = ['repair', 'pet', 'helping'].includes(job.kind) && (!job.terminal || status === 'completed');
  const { data: options, isFetching: optionsLoading, refetch: refetchOptions } = useJobOptionsQuery({ id: job.id, status }, { skip: !optionsOn });

  const feed = useTrackingFeed(job.kind === 'order' ? null : job.id, { enabled: Boolean(job.trip), live: !job.terminal });
  const eta = feed.etaMinutes;
  const firstName = firstNameOf(job.provider?.name);
  const feedEvents = useMemo(() => job.history
    .map((h) => ({ status: h.stage, at: h.at, text: feedCopy(h.stage, firstName, job.noun) as string }))
    .filter((e) => e.text)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [job.history, firstName, job.noun]);
  const needsYou = NEEDS_YOU.includes(job.rawStatus || '');

  // Chosen but not yet accepted: no "accepted" notice until they tap Accept.
  useStatusNotice(job.rawStatus === 'PROVIDER_ASSIGNED' ? 'waiting' : status, needsYou, { name: job.provider?.name, rating: job.provider?.rating, jobs: job.provider?.jobs, eta });

  const target = job.trip?.to || (job.place.lat != null && job.place.lng != null ? { lat: job.place.lat, lng: job.place.lng } : null);
  const showMap = mapsAvailable && !job.terminal && ['assigned', 'on_the_way', 'arrived'].includes(status) && !!target;
  const stopped = status === 'cancelled' || status === 'failed';
  const hasReceipt = status === 'completed' && ['repair', 'pet', 'helping'].includes(job.kind);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/orders' as never));
  const openCancel = () => { setCancelOpen(true); if (optionsOn) refetchOptions(); };
  const support = () => router.push('/support' as never);

  return (
    <View style={styles.page}>
      <TrackingHeader job={job} onBack={back} onSOS={() => setSosOpen(true)} onSupport={support} />
      <ScrollView contentContainerStyle={{ paddingBottom: job.terminal ? insets.bottom + 260 : insets.bottom + spacing.xl }}>
        {showMap && target ? (
          <View style={styles.map}>
            <LiveTrackingMap orderId={job.id} pickupLat={target.lat} pickupLng={target.lng} initialWorkerLocation={feed.workerLocation} style={StyleSheet.absoluteFill} />
          </View>
        ) : null}

        <StatusBlock job={job} status={status} eta={eta} options={options} needsYou={needsYou}>
          {status === 'searching' ? <SearchingHero search={options?.search} noun={job.noun} /> : null}
          <StartCodeCard jobKey={`${job.kind}:${job.id}`} code={startCode} stage={codeStage || status} noun={job.noun} />
          {['repair', 'pet', 'helping'].includes(job.kind) && !job.terminal ? (
            <Row Icon={UserPlus} title="Booked for someone else?" sub="Share a live link so they can follow the job and give the start code"
              onPress={async () => {
                try {
                  const { url } = await shareJob(job.id).unwrap();
                  await Share.share({ message: `Follow my ${job.service} booking live on ZappyOne: ${url}` });
                } catch (err) { toast.error(errText(err, 'Could not make a link. Try again.')); }
              }} />
          ) : null}
          {options?.moreTime?.until && !job.terminal && status !== 'in_progress' ? (
            <Row Icon={Clock} title={`Finishing by ${clock(options.moreTime.until)}`} sub={`${options.moreTime.reason}. Nothing extra is charged unless you approve a new quote.`} />
          ) : null}
        </StatusBlock>
        {options?.payTo ? <PayPro jobId={job.id} payTo={options.payTo} onClaimed={refetchOptions} /> : null}

        {job.provider && !job.terminal ? (
          <WorkerRichCard job={job}
            onCall={job.provider.phone ? () => callNumber(job.provider!.phone!) : undefined}
            onChat={job.kind !== 'order' ? () => setChatOpen(true) : undefined} />
        ) : null}
        {acct && !acct.email && !acct.pendingEmail ? (
          <Section>
            <Row first Icon={MailPlus} title="Add your email for updates and the invoice"
              right={<Pressable onPress={() => router.push('/account-security' as never)} accessibilityRole="button" style={styles.addNow}><Text variant="bodySmall" weight="bold" color="#FFFFFF">Add now</Text></Pressable>} />
          </Section>
        ) : null}
        <ProviderStatusNotes jobId={job.id} noun={job.noun} options={options} hasProvider={!!job.provider} onChanged={refetchOptions} />

        {!job.provider && !job.terminal ? (
          <Section style={styles.stack}>
            {options?.providerChangedAt ? (
              <Text variant="body" color={ink[700]}><Text variant="body" weight="bold">Your {job.noun} could not make it.</Text> We are finding the next one now. If you would rather not wait, you can cancel free.</Text>
            ) : null}
            {options?.search ? (
              <SlowSearchCard jobId={job.id} noun={job.noun} search={options.search} reschedule={options.reschedule} onCancel={cancel ? openCancel : null} onMoved={refetchOptions} />
            ) : null}
            <JobBoostCard jobId={job.id} boost={options?.boost} since={job.createdAt} noun={job.noun} onBoosted={refetchOptions} />
          </Section>
        ) : null}

        {extras ? <Section style={styles.stack}>{extras}</Section> : null}

        {status === 'completed' || options?.tip?.beforePayment ? (
          <Section style={styles.stack}>
            <JobTipCard jobId={job.id} tip={options?.tip} name={firstName || null} onTipped={refetchOptions} />
            {['repair', 'helping'].includes(job.kind) && status === 'completed' ? <RepeatCard jobId={job.id} noun={job.noun === 'helper' ? 'task' : 'booking'} /> : null}
          </Section>
        ) : null}

        {status === 'completed' && job.proofs.length ? (
          <Section title="Photos of the work">
            <View style={styles.photos}>{job.proofs.map((url, i) => <View key={url + i} style={job.proofs.length === 1 ? styles.full : styles.half}><ProofPhoto url={url} index={i} /></View>)}</View>
          </Section>
        ) : null}

        {!stopped ? <ActivityFeed events={feedEvents} live={!job.terminal} /> : null}

        {!job.terminal ? <AddServices jobId={job.id} extras={options?.extras} added={options?.addedExtras} onAdded={refetchOptions} /> : null}

        <BookingSummary job={job} onReceipt={hasReceipt ? () => router.push(`/bill?source=job&id=${job.id}` as never) : undefined}
          onEditPlace={options?.place?.allowed && !job.terminal ? () => setEditPlace(true) : undefined}
          contact={options?.contact} onEditContact={options?.contact?.allowed && !job.terminal ? () => setEditContact(true) : undefined} />

        {!stopped ? (
          <Section title="ZappyOne promise">
            <Row first Icon={ShieldCheck} title="Verified professionals" sub="ID and skills checked before their first job" />
            <Row Icon={BadgeIndianRupee} title="Price agreed before work" sub="Nothing extra is charged without your approval" />
            <Row Icon={Headphones} title="Help when you need it" sub="Chat with ZappyOne support" onPress={support} />
          </Section>
        ) : null}

        {!job.terminal ? <RescheduleCancel job={job} reschedule={options?.reschedule} cancel={cancel} onCancel={openCancel} onMoved={refetchOptions} /> : null}
      </ScrollView>

      {job.terminal ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.base }]}>
          {status === 'completed' && onRate ? <RatingPanel onRate={onRate} name={firstName || null} /> : null}
          {rebookHref && status === 'completed' ? <Button label="Book again" icon={<Repeat2 size={18} color="#fff" />} onPress={() => router.push(rebookHref as never)} fullWidth /> : null}
          <Button label="Back to home" variant={rebookHref && status === 'completed' ? 'outline' : 'primary'} onPress={() => router.replace('/' as never)} fullWidth />
        </View>
      ) : null}

      {cancel ? <CancelSheet visible={cancelOpen} onClose={() => setCancelOpen(false)} quote={options?.cancel} loading={optionsLoading} quoteNeeded={optionsOn} reasons={options?.reasons || []} note={cancel.note} onCancel={cancel.run} /> : null}
      {editPlace ? <EditPlaceSheet job={job} maxMoveM={options?.place?.maxMoveM} onClose={() => setEditPlace(false)} onSaved={refetchOptions} /> : null}
      {celebrate ? <BookedCelebration lines={[job.service, job.subtitle]} reference={job.reference} noun={job.noun} onDone={() => { setCelebrate(false); router.setParams({ booked: undefined } as never); }} /> : null}
      {editContact ? <ContactSheet job={job} onSite={options?.contact?.onSite ?? null} onClose={() => setEditContact(false)} onSaved={refetchOptions} /> : null}
      <SosSheet visible={sosOpen} onClose={() => setSosOpen(false)} onAlert={onSOS} />
      {chatOpen ? <JobChat jobId={job.id} title={job.provider?.name || `Your ${job.noun}`} onClose={() => setChatOpen(false)} /> : null}
      <ConnectionBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  map: { height: 300, backgroundColor: slate[100] },
  stack: { gap: spacing.md },
  addNow: { height: 36, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[600] },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  full: { width: '100%' },
  half: { width: '48%' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: spacing.sm, paddingHorizontal: spacing.base, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: slate[200] },
});
