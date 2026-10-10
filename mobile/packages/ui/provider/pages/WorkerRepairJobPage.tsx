/**
 * A repair job, for the provider doing it (the websites' WorkerRepairJobPage).
 * One next step at a time, from the status and how the job is done; the
 * customer's handover code before steps that need it; arrival only within the
 * radius; a quote when the price has to change; QA before completion; proof
 * photos; money last. Every rule is the shared jobFlows logic.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, FileText } from 'lucide-react-native';
import {
  useGetRepairBookingQuery,
  useTransitionRepairBookingMutation,
  useCollectRepairCashMutation,
  useVerifyRepairHandoverCodeMutation,
  useDeclineRepairBookingMutation,
  useAttachRepairCompletionPhotosMutation,
} from '@zappy/core/api';
import { useTripPublish, useArrivalProximity } from '@zappy/core/hooks/useJobTrip';
import {
  repairGateFor,
  REPAIR_GATE_COPY,
  repairNextAction,
  REPAIR_QUOTABLE,
  repairReadyForPayment,
  repairDue,
  canPassBackToShop,
  REPAIR_PHOTO_STAGES,
  REPAIR_ENDED,
  REPAIR_NO_SOS,
  MOVING_STATUSES,
  tripOf,
  pointOf,
} from '@zappy/core/shared/jobFlows';
import { PASS_REASONS } from '@zappy/core/shared/jobOffers';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Button, EmptyState, LoadingState, Text } from '../../components';
import { toast } from '../../components/Toast';
import { ArrivalBar } from '../../components/common/ArrivalBar';
import { CodeBoxes } from '../../components/common/CodeBoxes';
import { CollectPaymentCard } from '../../components/common/CollectPaymentCard';
import { ProofPhotos, readyKeys, photosSettled, type ProofPhoto } from '../../components/common/ProofPhotos';
import { JobCard, Eyebrow } from '../../components/jobs/JobCard';
import { JobChatButton } from '../../components/jobs/JobChatButton';
import { JobEarningsCard } from '../../components/worker/JobEarningsCard';
import { JobMapCard } from '../../components/worker/JobMapCard';
import { RateCustomerCard } from '../../components/worker/RateCustomerCard';
import { SOSButton } from '../../components/worker/SOSButton';
import { TripSharingBanner } from '../../components/worker/TripSharingBanner';
import { errText } from '../../lib/feedback';
import { colors, zappy, ink, slate, accent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { GiveBackCard } from '../GiveBackCard';
import { OnSiteCard } from '../OnSiteCard';
import { AssignTechnician } from '../components/AssignTechnician';
import { QAPanel } from '../components/repair/QAPanel';
import { rupees, QuoteBuilder } from '../components/repair/QuoteBuilder';

export function WorkerRepairJobPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useGetRepairBookingQuery(id, { pollingInterval: 20000 });
  const [transition, { isLoading: moving }] = useTransitionRepairBookingMutation();
  const [collectCash, { isLoading: collecting }] = useCollectRepairCashMutation();
  const [attachPhotos] = useAttachRepairCompletionPhotosMutation();
  const [verifyCode, { isLoading: verifying }] = useVerifyRepairHandoverCodeMutation();
  const [declineJob, { isLoading: passing }] = useDeclineRepairBookingMutation();
  const [showQuote, setShowQuote] = useState<false | 'new' | 'additional'>(false);
  const [otp, setOtp] = useState('');
  const [photos, setPhotos] = useState<ProofPhoto[]>([]);
  const [askingPass, setAskingPass] = useState(false);

  const booking = data?.booking;
  const status: string | undefined = booking?.status;
  const isOwner = useAppSelector((s) => s.auth.role) === 'shop';
  const ownerGoing = isOwner && !booking?.workerId;
  const onTrip = !!status && MOVING_STATUSES.includes(status);
  const sharing = useTripPublish(id, onTrip && (!isOwner || ownerGoing), { asOwner: ownerGoing });
  const headingToCustomer = status === 'ON_THE_WAY';
  const proximity = useArrivalProximity(booking?.location?.coordinates, headingToCustomer);

  if (isLoading) return <View style={styles.page}><LoadingState /></View>;
  if (!booking) {
    return (
      <View style={[styles.page, styles.centerAll]}>
        <EmptyState title="Job not found" actionLabel="Back to home" onAction={() => router.replace('/worker' as never)} />
      </View>
    );
  }

  const action = repairNextAction(booking.status, booking.serviceMode);
  const wantsPhotos = REPAIR_PHOTO_STAGES.includes(booking.status);
  const photosBlocked = wantsPhotos && !photosSettled(photos);
  const tooFarToArrive = headingToCustomer && !proximity.withinRadius;
  const gateKind: 'start' | 'handover' | 'return' | null = action ? repairGateFor(action.to, booking.serviceMode) : null;
  const gatePassed = gateKind ? !!booking.otpVerified?.[`${gateKind}At`] : true;
  const snap = booking.priceSnapshot || {};
  const quotes: { _id: string; revision: number; status: string; totalPaise: number }[] = data?.quotes || [];
  const transcript: { questionId?: string; question: string; answer: string }[] = booking.diagnosticAnswers?.transcript || [];
  const { duePaise, carriedPaise, tipPaise } = repairDue(booking);
  const canPassBack = canPassBackToShop(booking, isOwner);
  const ownerWatching = isOwner && !!booking.workerId;
  const trip = tripOf('repair', booking);

  async function confirmCode() {
    try {
      await verifyCode({ id, kind: gateKind, code: otp }).unwrap();
      setOtp(''); toast.success('Code confirmed'); refetch();
    } catch (err) { toast.error(errText(err, 'That code did not work')); setOtp(''); }
  }
  async function collect() {
    try {
      const res = await collectCash(id).unwrap();
      toast.success(res.alreadyPaid ? 'Already recorded' : 'Payment recorded'); refetch();
    } catch (err) { toast.error(errText(err, 'Could not record the payment')); }
  }
  async function passBack(reason: string) {
    try {
      await declineJob({ id, reason }).unwrap();
      toast.success('Sent back to your shop owner'); router.replace('/worker' as never);
    } catch (err) { toast.error(errText(err, 'Could not pass the job back')); }
  }
  async function move(to: string) {
    try {
      const keys = readyKeys(photos);
      if (keys.length) await attachPhotos({ id, photos: keys }).unwrap();
      await transition({ id, status: to }).unwrap();
      toast.success('Updated'); refetch();
    } catch (err) { toast.error(errText(err, 'Could not update this job')); }
  }

  const details: [string, string | undefined][] = [
    ['Device', booking.deviceName || `${booking.brandCode} ${booking.modelCode}`],
    ...(booking.fuelType ? [['Fuel', booking.fuelType] as [string, string]] : []),
    ...(booking.configurationLabel ? [['Build', booking.configurationLabel] as [string, string]] : []),
    ['Reported', (booking.problemCodes || []).join(', ').replace(/_/g, ' ') || '—'],
    ['Repair', booking.repairCode?.replace(/_/g, ' ') || 'Diagnosis first'],
    ['Mode', (booking.serviceMode || '').replace(/_/g, ' ')],
    ['Address', booking.location?.address],
  ];

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/worker' as never))} accessibilityLabel="Back" hitSlop={8} style={styles.back}><ArrowLeft size={20} color={ink[900]} /></Pressable>
        <View style={styles.flex}>
          <Text variant="caption" color={ink[500]}>Repair job</Text>
          <Text variant="body" weight="semibold">{booking.reference}</Text>
        </View>
        <JobChatButton jobId={booking._id} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxxl }]} keyboardShouldPersistTaps="handled">
        {onTrip && (!isOwner || ownerGoing) && trip ? <TripSharingBanner sharing={sharing} to={trip.to} toCustomer={trip.toCustomer} /> : null}
        <OnSiteCard onSite={booking.onSite} />
        {isOwner ? (
          <JobCard>
            <Eyebrow>TECHNICIAN</Eyebrow>
            {!booking.workerId ? <Text variant="caption" color={ink[700]}>You can go yourself: use the steps below and the customer follows you live. Or hand it to one of your technicians.</Text> : null}
            <AssignTechnician jobId={id} workerId={booking.workerId} onDone={refetch} startOpen={!booking.workerId} />
          </JobCard>
        ) : null}
        {booking.serviceMode !== 'workshop' && !REPAIR_ENDED.includes(booking.status) ? <JobMapCard to={pointOf(booking.location)} live={!isOwner || ownerGoing} /> : null}

        <JobCard>
          <Eyebrow>STATUS</Eyebrow>
          <Text variant="body" weight="bold" style={styles.capitalize}>{booking.status.replace(/_/g, ' ').toLowerCase()}</Text>
        </JobCard>

        {booking.status === 'COMPLETED' ? <JobEarningsCard jobId={booking._id} /> : null}
        {booking.status === 'COMPLETED' ? <RateCustomerCard jobId={booking._id} rated={!!booking.customerRating?.stars} /> : null}

        {repairReadyForPayment(booking) && (snap.totalPaise || 0) > 0 ? (
          <CollectPaymentCard amountPaise={duePaise} tipPaise={tipPaise} carriedPaise={carriedPaise} paymentMethod={booking.paymentMethod}
            paid={booking.paymentStatus === 'paid'} collecting={collecting} onCollect={collect} />
        ) : null}

        <JobCard>
          <Eyebrow>JOB</Eyebrow>
          {details.map(([k, v]) => (
            <View key={k} style={styles.between}>
              <Text variant="caption" color={ink[500]}>{k}</Text>
              <Text variant="bodySmall" weight="semibold" style={[styles.right, styles.capitalize]}>{v || '—'}</Text>
            </View>
          ))}
        </JobCard>

        {transcript.length > 0 || booking.diagnosisSummary ? (
          <JobCard>
            <Eyebrow>WHAT THE CUSTOMER TOLD US</Eyebrow>
            {transcript.length ? transcript.map((t, i) => (
              <View key={t.questionId || i} style={styles.row}>
                <View style={styles.num}><Text variant="caption" weight="black" color={ink[500]}>{i + 1}</Text></View>
                <View style={styles.flex}>
                  <Text variant="caption" color={ink[500]}>{t.question}</Text>
                  <Text variant="bodySmall" weight="bold">{t.answer}</Text>
                </View>
              </View>
            )) : <Text variant="caption" color={accent[600]}>The step-by-step answers were not recorded for this booking.</Text>}
            {booking.diagnosisSummary ? <Text variant="caption" color={ink[500]}>{booking.diagnosisSummary}</Text> : null}
          </JobCard>
        ) : null}

        <JobCard>
          <View style={styles.between}>
            <Text variant="bodySmall" weight="bold">{snap.isEstimate ? 'Estimate' : 'Agreed price'}</Text>
            <Text variant="heading2" weight="black">{rupees(snap.totalPaise)}</Text>
          </View>
        </JobCard>

        {booking.status === 'CUSTOMER_APPROVAL_PENDING' ? (
          <JobCard tone="amber" style={styles.row}>
            <FileText size={16} color={accent[600]} />
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="bold" color={accent[700]}>Waiting for customer approval</Text>
              <Text variant="caption" color={accent[700]}>Do not start work until they approve the quote.</Text>
            </View>
          </JobCard>
        ) : null}

        <GiveBackCard jobId={booking._id} status={booking.status} />

        {canPassBack ? (
          <JobCard>
            {askingPass ? (
              <View style={styles.gap}>
                <Text variant="bodySmall" weight="bold">Why are you passing this back to your shop?</Text>
                <View style={styles.wrap}>
                  {PASS_REASONS.map((r: string) => (
                    <Pressable key={r} onPress={() => passBack(r)} disabled={passing} style={styles.chip}><Text variant="caption" weight="semibold">{r}</Text></Pressable>
                  ))}
                </View>
                <Pressable onPress={() => setAskingPass(false)} hitSlop={8}><Text variant="caption" weight="semibold" color={ink[400]}>Back</Text></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setAskingPass(true)} style={styles.centerRow}><Text variant="bodySmall" weight="semibold" color={ink[500]}>Can't do this job? Pass it back to your shop</Text></Pressable>
            )}
          </JobCard>
        ) : null}

        {quotes.length ? (
          <JobCard>
            <Eyebrow>QUOTES RAISED</Eyebrow>
            {quotes.map((q) => (
              <View key={q._id} style={styles.between}>
                <Text variant="caption" color={ink[500]}>r{q.revision} · {q.status.replace(/_/g, ' ')}</Text>
                <Text variant="caption" weight="semibold">{rupees(q.totalPaise)}</Text>
              </View>
            ))}
          </JobCard>
        ) : null}

        {showQuote ? (
          <QuoteBuilder bookingId={id} bookedRepair={booking.repairCode || null} vertical={booking.vertical} additional={showQuote === 'additional'}
            snapshot={snap} onSent={() => { setShowQuote(false); refetch(); }} onCancel={() => setShowQuote(false)} />
        ) : REPAIR_QUOTABLE.includes(booking.status) ? (
          booking.status === 'REPAIR_IN_PROGRESS'
            ? <Button variant="outline" icon={<AlertTriangle size={15} color={accent[700]} />} label="I've found another problem" onPress={() => setShowQuote('additional')} fullWidth />
            : <Button variant="outline" icon={<FileText size={15} color={zappy[700]} />} label="Raise a quote" onPress={() => setShowQuote('new')} fullWidth />
        ) : null}

        {booking.status === 'QA_PENDING' ? <QAPanel bookingId={id} onDone={refetch} /> : null}

        {wantsPhotos ? (
          <ProofPhotos photos={photos} onChange={setPhotos} folder="order-proof" title="Photos of the finished repair"
            hint="The customer sees these. They are also your evidence if the work is questioned later." />
        ) : null}

        {headingToCustomer ? <ArrivalBar metres={proximity.metres} radius={proximity.radius} /> : null}

        {ownerWatching && action ? <JobCard><Text variant="bodySmall" color={ink[500]} style={styles.centerText}>Your technician takes the next step from their app: {action.label.toLowerCase()}.</Text></JobCard> : null}

        {!ownerWatching && action && gateKind && !gatePassed ? (
          <JobCard tone="amber">
            <CodeBoxes value={otp} onChange={setOtp} title={REPAIR_GATE_COPY[gateKind].title} hint={REPAIR_GATE_COPY[gateKind].hint} />
            <Button label="Confirm code" onPress={confirmCode} loading={verifying} disabled={otp.length < 6} fullWidth />
          </JobCard>
        ) : null}

        {!ownerWatching && action ? (
          <Button label={action.label} onPress={() => move(action.to)} loading={moving}
            disabled={(!!gateKind && !gatePassed) || tooFarToArrive || photosBlocked} fullWidth size="large" />
        ) : null}

        {!ownerWatching && !REPAIR_NO_SOS.includes(booking.status) ? <SOSButton jobId={booking._id} kind="repair" service={booking.vertical} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  centerAll: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  centerRow: { alignItems: 'center', minHeight: 40, justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  right: { textAlign: 'right', flexShrink: 1 },
  capitalize: { textTransform: 'capitalize' },
  gap: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  body: { padding: spacing.base, gap: spacing.md },
  num: { width: 22, height: 22, borderRadius: 11, backgroundColor: slate[100], alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 36, justifyContent: 'center' },
});
