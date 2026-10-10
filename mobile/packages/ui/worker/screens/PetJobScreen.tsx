/**
 * A pet-care booking, for the provider doing it (the websites'
 * WorkerPetJobPage): accept or decline when chosen, the steps with the
 * customer's start code, before/after photos, the handling-risk warning,
 * payment, earnings and rating. Rules are the shared jobFlows logic.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowLeft, PawPrint } from 'lucide-react-native';
import {
  useGetPetBookingQuery, useAdvancePetBookingStatusMutation, useAddPetBookingProofMutation, useCollectPetCashMutation,
  useAcceptPetBookingMutation, useDeclinePetBookingMutation,
} from '@zappy/core/api';
import { PET_NEXT, PET_DONE, PET_PAY_STAGES, PET_LIVE, petDuePaise, petBrief, tripOf, pointOf } from '@zappy/core/shared/jobFlows';
import { formatPaise, billTipPaise } from '@zappy/core/shared/money';
import { useAppSelector } from '@zappy/core/store/hooks';
import { useTripPublish } from '@zappy/core/hooks/useJobTrip';
import { Button, EmptyState, LoadingState, Text } from '../../components';
import { toast } from '../../components/Toast';
import { colors, ink, slate, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { JobCard, Eyebrow, OnSiteCard, TripBanner, JobMapCard, CollectPaymentCard, JobEarningsCard, useStartCodeGate } from '../../jobs/parts';
import { ChatButton, GiveBackCard, RateCustomerCard, SOSButton, ProofPhotos, readyKeys, AssignTechnician, type ProofPhoto } from '../../jobs/kit';

type ApiErr = { data?: { error?: string; code?: string; kind?: string } };
const errText = (e: unknown, f: string) => (e as ApiErr)?.data?.error || f;

export function PetJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useGetPetBookingQuery(id, { pollingInterval: 10000 });
  const [advance] = useAdvancePetBookingStatusMutation();
  const [addProof] = useAddPetBookingProofMutation();
  const [collectCash, { isLoading: collecting }] = useCollectPetCashMutation();
  const [acceptOffer, { isLoading: accepting }] = useAcceptPetBookingMutation();
  const [declineOffer, { isLoading: declining }] = useDeclinePetBookingMutation();
  const [before, setBefore] = useState<ProofPhoto[]>([]);
  const [after, setAfter] = useState<ProofPhoto[]>([]);
  const [completing, setCompleting] = useState(false);
  const gate = useStartCodeGate();
  const booking = data?.booking;
  const trip = tripOf('pet', booking);
  const isOwner = useAppSelector((s) => s.auth.role) === 'shop';
  const ownerGoing = isOwner && !booking?.workerId;
  const sharing = useTripPublish(id, Boolean(trip) && (!isOwner || ownerGoing), { asOwner: ownerGoing });

  if (isLoading) return <View style={styles.page}><LoadingState /></View>;
  if (!booking) return <View style={[styles.page, styles.center]}><EmptyState title="Booking not found" actionLabel="Back to work" onAction={() => router.replace('/worker/work' as never)} /></View>;

  const { brief, risky, level } = petBrief(booking);
  const nextMoves = (PET_NEXT[booking.status as keyof typeof PET_NEXT] || []) as [string, string][];
  const offered = booking.status === 'PROVIDER_ASSIGNED';
  const ownerWatching = isOwner && !!booking.workerId;

  async function move(status: string) {
    try {
      await gate.run((code) => advance({ id: booking._id, status, code }).unwrap().then((r: unknown) => { refetch(); return r; }));
    } catch (err) { toast.error(errText(err, 'Could not update')); }
  }
  async function complete() {
    setCompleting(true);
    try {
      for (const key of readyKeys(before)) await addProof({ id: booking._id, kind: 'before', key }).unwrap();
      for (const key of readyKeys(after)) await addProof({ id: booking._id, kind: 'after', key }).unwrap();
      const res = await advance({ id: booking._id, status: 'SERVICE_COMPLETED' }).unwrap();
      if (res.booking?.status === 'PAYMENT_PENDING') { toast.success('Service completed. Now take the payment.'); refetch(); }
      else { toast.success('Completed and settled'); router.replace('/worker/work' as never); }
    } catch (err) {
      const e = err as ApiErr;
      if (e?.data?.code === 'PROOF_REQUIRED') toast.error(`A ${e.data.kind?.replace('_', ' ')} photo is required first`);
      else toast.error(errText(err, 'Could not complete'));
    } finally { setCompleting(false); }
  }
  async function answerOffer(yes: boolean) {
    try {
      if (yes) { await acceptOffer(booking._id).unwrap(); toast.success('Accepted. The customer has been told.'); refetch(); }
      else { await declineOffer({ id: booking._id, reason: 'Declined by provider' }).unwrap(); toast('Declined. We will find someone else.'); router.replace('/worker/work' as never); }
    } catch (err) { toast.error(errText(err, 'Could not send your answer')); refetch(); }
  }
  async function recordCash() {
    try { await collectCash(booking._id).unwrap(); toast.success('Payment recorded'); router.replace('/worker/work' as never); }
    catch (err) { toast.error(errText(err, 'Could not record the payment')); }
  }

  return (
    <View style={styles.page}>
      {gate.prompt}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/worker/work' as never))} accessibilityLabel="Back" hitSlop={8} style={styles.back}><ArrowLeft size={20} color={ink[900]} /></Pressable>
        <View style={styles.flex}><Text variant="caption" color={ink[500]}>Pet care</Text><Text variant="body" weight="semibold">{booking.reference}</Text></View>
        <ChatButton jobId={booking._id} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxxl }]}>
        {trip && (!isOwner || ownerGoing) ? <TripBanner sharing={sharing} to={trip.to} toCustomer={trip.toCustomer} /> : null}
        <OnSiteCard onSite={booking.onSite} />
        <GiveBackCard jobId={booking._id} status={booking.status} />
        {isOwner ? (
          <JobCard>
            <Eyebrow>WHO GOES</Eyebrow>
            {!booking.workerId ? <Text variant="caption" color={ink[700]}>You can go yourself: use the steps below and the pet's owner follows you live. Or hand it to one of your team.</Text> : null}
            <AssignTechnician jobId={id} workerId={booking.workerId} onDone={refetch} startOpen={!booking.workerId} />
          </JobCard>
        ) : null}
        <JobCard>
          <View style={styles.row}><PawPrint size={15} color={ink[900]} /><Text variant="body" weight="bold" style={styles.flex}>{[brief.name, brief.species, brief.size?.replace('_', ' ')].filter(Boolean).join(' · ')}</Text></View>
          {brief.breed ? <Text variant="caption" color={ink[500]}>{brief.breed}</Text> : null}
        </JobCard>
        {risky ? (
          <JobCard tone="red" style={styles.row}>
            <AlertTriangle size={16} color={danger[600]} />
            <Text variant="caption" color={danger[600]} style={styles.flex}>This pet is flagged {level} risk for handling. {brief.specialHandling || 'Take extra care and go slowly.'}</Text>
          </JobCard>
        ) : null}
        {!PET_DONE.includes(booking.status) && !['CANCELLED', 'REFUNDED'].includes(booking.status) ? <JobMapCard to={pointOf(booking.serviceLocation)} live={!ownerWatching} /> : null}

        {ownerWatching && (nextMoves.length > 0 || offered || booking.status === 'SERVICE_STARTED')
          ? <JobCard><Text variant="bodySmall" color={ink[500]} style={styles.centerText}>Your technician takes the next step from their app.</Text></JobCard> : null}

        {!ownerWatching && offered ? (
          <JobCard tone="amber">
            <Text variant="body" weight="semibold">A customer chose you for this booking</Text>
            <Text variant="bodySmall" color={ink[700]}>You earn {formatPaise(booking.pricing?.providerAmountPaise || 0)}. If you can't do it, decline so we can find someone else in time.</Text>
            <View style={styles.row}>
              <Button label="Decline" variant="outline" onPress={() => answerOffer(false)} disabled={declining || accepting} loading={declining} style={styles.flex} />
              <Button label="Accept" onPress={() => answerOffer(true)} disabled={declining || accepting} loading={accepting} style={styles.flex} />
            </View>
          </JobCard>
        ) : null}

        {!ownerWatching ? nextMoves.map(([status, label]) => <Button key={status} label={label} onPress={() => move(status)} fullWidth size="large" />) : null}

        {!ownerWatching && booking.status === 'SERVICE_STARTED' ? (
          <>
            <ProofPhotos photos={before} onChange={setBefore} folder="pet/before" max={2} title="Before photo" />
            <ProofPhotos photos={after} onChange={setAfter} folder="pet/after" max={2} title="After photo" />
            <Button label="Complete service" variant="success" onPress={complete} loading={completing} fullWidth size="large" />
          </>
        ) : null}

        {PET_PAY_STAGES.includes(booking.status) ? (
          <CollectPaymentCard amountPaise={petDuePaise(booking)} tipPaise={billTipPaise(booking)} paymentMethod={booking.paymentMethod}
            paid={booking.paymentStatus === 'paid'} collecting={collecting} onCollect={recordCash} />
        ) : null}
        {PET_DONE.includes(booking.status) ? <JobEarningsCard jobId={booking._id} /> : null}
        {PET_DONE.includes(booking.status) ? <RateCustomerCard jobId={booking._id} rated={!!booking.customerRating?.stars} /> : null}
        {!ownerWatching && PET_LIVE.includes(booking.status) ? <SOSButton jobId={booking._id} kind="pet" service={booking.categoryCode} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  body: { padding: spacing.base, gap: spacing.md },
});
