/**
 * A repair job, for the provider doing it (the websites' WorkerRepairJobPage).
 * One next step at a time, from the status and how the job is done; the
 * customer's handover code before steps that need it; arrival only within the
 * radius; a quote when the price has to change; QA before completion; proof
 * photos; money last. Every rule is the shared jobFlows logic.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowLeft, Check, ClipboardCheck, FileText, Plus, Trash2, X } from 'lucide-react-native';
import {
  useGetRepairBookingQuery, useTransitionRepairBookingMutation, useCollectRepairCashMutation, useSubmitRepairQuoteMutation,
  useRepairQaChecklistQuery, useSubmitRepairQaMutation, useVerifyRepairHandoverCodeMutation, useDeclineRepairBookingMutation,
  useRepairWorkCatalogQuery, useAttachRepairCompletionPhotosMutation,
} from '@zappy/core/api';
import {
  repairGateFor, REPAIR_GATE_COPY, repairNextAction, REPAIR_QUOTABLE, repairReadyForPayment, repairDue, canPassBackToShop,
  repairAgreedPaise, quoteTotalPaise, quotePayload, quoteRepairOptions, qaState, qaPayload, QUOTE_LINE_KINDS, rupeesInput,
  REPAIR_PHOTO_STAGES, REPAIR_ENDED, REPAIR_NO_SOS, MOVING_STATUSES, tripOf, pointOf,
} from '@zappy/core/shared/jobFlows';
import { PASS_REASONS } from '@zappy/core/shared/jobOffers';
import { formatPaise } from '@zappy/core/shared/money';
import { useAppSelector } from '@zappy/core/store/hooks';
import { useTripPublish, useArrivalProximity } from '@zappy/core/hooks/useJobTrip';
import { Button, EmptyState, LoadingState, Text } from '../../components';
import { toast } from '../../components/Toast';
import { colors, zappy, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { JobCard, Eyebrow, OnSiteCard, TripBanner, JobMapCard, ArrivalBar, CodeBoxes, CollectPaymentCard, JobEarningsCard } from '../../jobs/parts';
import { ChatButton, GiveBackCard, RateCustomerCard, SOSButton, ProofPhotos, readyKeys, photosSettled, AssignTechnician, type ProofPhoto } from '../../jobs/kit';

type ApiErr = { data?: { error?: string; code?: string } };
const errText = (e: unknown, f: string) => (e as ApiErr)?.data?.error || f;
const rupees = formatPaise;

function Select({ value, options, onChange, placeholder }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.select} accessibilityRole="button">
        <Text variant="bodySmall" color={current ? ink[900] : ink[400]} style={styles.flex}>{current?.label || placeholder}</Text>
      </Pressable>
      {open ? (
        <View style={styles.options}>
          <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
            {options.map((o) => (
              <Pressable key={o.value} onPress={() => { onChange(o.value); setOpen(false); }} style={styles.option}>
                <Text variant="bodySmall" weight={o.value === value ? 'bold' : 'regular'}>{o.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function QuoteBuilder({ bookingId, bookedRepair, vertical, additional, snapshot, onSent, onCancel }: {
  bookingId: string; bookedRepair: string | null; vertical?: string; additional: boolean; snapshot: Record<string, unknown>; onSent: () => void; onCancel: () => void;
}) {
  const [repairCode, setRepairCode] = useState(bookedRepair || '');
  const agreedPaise: number = repairAgreedPaise(snapshot);
  const [replace, setReplace] = useState(false);
  const [replaceReason, setReplaceReason] = useState('');
  const [summary, setSummary] = useState('');
  const [warrantyDays, setWarrantyDays] = useState('90');
  const [items, setItems] = useState([{ kind: 'part', label: '', priceRupees: '', quantity: 1 }]);
  const [submit, { isLoading }] = useSubmitRepairQuoteMutation();
  const { data: catalog, isLoading: loadingCatalog } = useRepairWorkCatalogQuery({ vertical }, { skip: !!bookedRepair });
  const total: number = quoteTotalPaise(items);
  const setItem = (idx: number, patch: object) => setItems((l) => l.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  async function send() {
    const { body, error } = quotePayload({ repairCode, summary, items, warrantyDays, additional, agreedPaise, replace, replaceReason });
    if (error) { toast.error(error); return; }
    try {
      await submit({ id: bookingId, ...body }).unwrap();
      toast.success(additional ? 'Sent — the customer decides before you carry on' : 'Quote sent — waiting for the customer to approve');
      onSent();
    } catch (err) { toast.error(errText(err, 'Could not send the quote')); }
  }

  return (
    <JobCard>
      <View style={styles.between}>
        <Text variant="body" weight="bold">{additional ? 'Extra work found' : 'Raise a quote'}</Text>
        <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Close"><X size={18} color={ink[400]} /></Pressable>
      </View>
      {agreedPaise > 0 ? (
        <View style={styles.soft}>
          <Text variant="caption" color={ink[700]}>The customer booked this at <Text variant="caption" weight="bold">{rupees(agreedPaise)}</Text>.</Text>
          <View style={styles.row}>
            {([[false, `Add on top of ${rupees(agreedPaise)}`], [true, 'Change the whole price']] as const).map(([v, label]) => (
              <Pressable key={label} onPress={() => setReplace(v)} style={[styles.toggle, replace === v && styles.toggleOn]}>
                <Text variant="caption" weight="semibold" color={replace === v ? zappy[700] : ink[700]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {replace ? (
            <TextInput value={replaceReason} onChangeText={setReplaceReason} multiline placeholder="Why the booked price no longer fits, e.g. a different part is needed" placeholderTextColor={ink[400]} style={styles.area} />
          ) : <Text variant="caption" color={ink[500]}>Enter only the extra parts or work. The booked price stays.</Text>}
        </View>
      ) : null}
      {additional ? (
        <View style={[styles.soft, { backgroundColor: accent[50] }]}>
          <Text variant="caption" color={accent[700]}>{agreedPaise && !replace
            ? 'Enter only what is extra. Work stops until the customer answers, and the clock pauses while it does.'
            : 'Include everything the customer is paying in total, not just the new part. Work stops until they answer, and the clock pauses while it does.'}</Text>
        </View>
      ) : null}
      {!bookedRepair ? (
        <View style={styles.gap}>
          <Text variant="caption" weight="bold">What will you fix?</Text>
          <Select value={repairCode} onChange={setRepairCode} placeholder={loadingCatalog ? 'Loading…' : 'Choose the repair'}
            options={quoteRepairOptions(catalog?.groups).map((r: { code: string; name: string; selected?: boolean }) => ({ value: r.code, label: `${r.name}${r.selected ? '' : ' (not in your list)'}` }))} />
        </View>
      ) : null}
      <View style={styles.gap}>
        <Text variant="caption" weight="bold">What did you find?</Text>
        <TextInput value={summary} onChangeText={setSummary} multiline placeholder="e.g. Panel and digitizer both failed; frame is intact." placeholderTextColor={ink[400]} style={styles.area} />
        <Text variant="caption" color={ink[400]}>The customer sees this word for word.</Text>
      </View>
      <View style={styles.gap}>
        <Text variant="caption" weight="bold">Charges</Text>
        {items.map((item, idx) => (
          <View key={idx} style={styles.line}>
            <Select value={item.kind} onChange={(v) => setItem(idx, { kind: v })} placeholder="Kind" options={QUOTE_LINE_KINDS.map((k: string) => ({ value: k, label: k }))} />
            <TextInput value={item.label} onChangeText={(v) => setItem(idx, { label: v })} placeholder="Description" placeholderTextColor={ink[400]} style={[styles.input, styles.flex]} />
            <View style={styles.price}>
              <Text variant="bodySmall" weight="semibold" color={ink[500]}>₹</Text>
              <TextInput value={item.priceRupees} onChangeText={(v) => setItem(idx, { priceRupees: rupeesInput(v) })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={ink[400]} style={styles.priceInput} accessibilityLabel="Price in rupees" />
            </View>
            {items.length > 1 ? <Pressable onPress={() => setItems((l) => l.filter((_, i) => i !== idx))} hitSlop={8} accessibilityLabel="Remove line"><Trash2 size={16} color={ink[400]} /></Pressable> : null}
          </View>
        ))}
        <Pressable onPress={() => setItems((l) => [...l, { kind: 'part', label: '', priceRupees: '', quantity: 1 }])} style={styles.row} hitSlop={6}>
          <Plus size={14} color={zappy[600]} /><Text variant="caption" weight="semibold" color={zappy[600]}>Add line</Text>
        </Pressable>
      </View>
      <View style={styles.gap}>
        <Text variant="caption" weight="bold">Warranty (days)</Text>
        <TextInput value={warrantyDays} onChangeText={(v) => setWarrantyDays(v.replace(/\D/g, ''))} keyboardType="number-pad" style={[styles.input, { width: 120 }]} />
      </View>
      {agreedPaise > 0 && !replace ? (
        <View style={styles.gapXs}>
          <View style={styles.between}><Text variant="caption" color={ink[700]}>Booked price</Text><Text variant="caption">{rupees(agreedPaise)}</Text></View>
          <View style={styles.between}><Text variant="caption" color={ink[700]}>Extra</Text><Text variant="caption">+ {rupees(total)}</Text></View>
        </View>
      ) : null}
      <View style={[styles.between, styles.soft]}>
        <Text variant="bodySmall" weight="semibold" color={ink[700]}>{agreedPaise > 0 && !replace ? 'New subtotal (before fees)' : 'Subtotal (before tax)'}</Text>
        <Text variant="heading3" weight="black">{rupees(agreedPaise > 0 && !replace ? agreedPaise + total : total)}</Text>
      </View>
      <Button label="Send quote to customer" onPress={send} loading={isLoading} fullWidth size="large" />
    </JobCard>
  );
}

function QAPanel({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const { data, isLoading } = useRepairQaChecklistQuery(bookingId);
  const [submit, { isLoading: submitting }] = useSubmitRepairQaMutation();
  const [results, setResults] = useState<Record<string, string>>({});
  if (isLoading) return <LoadingState />;
  const checklist = data?.checklist;
  if (!checklist) return null;
  const items: { code: string; label: string; required?: boolean }[] = checklist.items || [];
  const { requiredUntested, failedRequired } = qaState(items, results);

  async function send() {
    try {
      const res = await submit({ id: bookingId, ...qaPayload(checklist, results) }).unwrap();
      if (res.passed) { toast.success('QA passed — you can complete the job'); onDone(); }
      else toast.error('QA failed — fix the failed checks and re-run');
    } catch (err) { toast.error(errText(err, 'Could not submit QA')); }
  }

  return (
    <JobCard>
      <View style={styles.row}><ClipboardCheck size={16} color={zappy[600]} /><Text variant="body" weight="bold">{checklist.name}</Text></View>
      <Text variant="caption" color={ink[400]}>Required checks must pass before the job can be completed.</Text>
      {items.map((item) => {
        const val = results[item.code];
        return (
          <View key={item.code} style={styles.qaRow}>
            <View style={styles.flex}>
              <Text variant="bodySmall">{item.label}</Text>
              {item.required ? <Text variant="caption" weight="bold" color={danger[500]}>REQUIRED</Text> : null}
            </View>
            {([['pass', success[600]], ['fail', danger[600]], ['not_applicable', ink[700]]] as const).map(([r, tone]) => (
              <Pressable key={r} onPress={() => setResults((s) => ({ ...s, [item.code]: r }))} accessibilityRole="radio" accessibilityState={{ selected: val === r }}
                accessibilityLabel={`${item.label}: ${r === 'not_applicable' ? 'not applicable' : r}`} style={[styles.qaBtn, val === r && { backgroundColor: tone }]}>
                {r === 'pass' ? <Check size={13} color={val === r ? '#fff' : ink[500]} /> : r === 'fail' ? <X size={13} color={val === r ? '#fff' : ink[500]} />
                  : <Text variant="caption" weight="bold" color={val === r ? '#fff' : ink[500]}>N/A</Text>}
              </Pressable>
            ))}
          </View>
        );
      })}
      {failedRequired.length ? (
        <View style={[styles.row, styles.alert]}><AlertTriangle size={14} color={danger[600]} />
          <Text variant="caption" color={danger[600]} style={styles.flex}>{failedRequired.length} required check{failedRequired.length > 1 ? 's' : ''} failed. Completion is blocked until resolved.</Text></View>
      ) : null}
      <Button label={requiredUntested.length ? `${requiredUntested.length} required check(s) left` : 'Submit QA'} onPress={send} loading={submitting} disabled={requiredUntested.length > 0} fullWidth />
    </JobCard>
  );
}

export function RepairJobScreen() {
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
        <ChatButton jobId={booking._id} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxxl }]} keyboardShouldPersistTaps="handled">
        {onTrip && (!isOwner || ownerGoing) && trip ? <TripBanner sharing={sharing} to={trip.to} toCustomer={trip.toCustomer} /> : null}
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
  gapXs: { gap: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  body: { padding: spacing.base, gap: spacing.md },
  num: { width: 22, height: 22, borderRadius: 11, backgroundColor: slate[100], alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 36, justifyContent: 'center' },
  soft: { backgroundColor: slate[50], borderRadius: radius.button, padding: spacing.md, gap: spacing.sm },
  toggle: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.sm, backgroundColor: colors.surface, minHeight: 40, justifyContent: 'center' },
  toggleOn: { borderColor: zappy[600] },
  area: { minHeight: 72, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], textAlignVertical: 'top', backgroundColor: colors.surface },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price: { flexDirection: 'row', alignItems: 'center', width: 96, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.sm },
  priceInput: { flex: 1, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900] },
  select: { minHeight: 44, minWidth: 92, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, justifyContent: 'center', backgroundColor: colors.surface },
  options: { marginTop: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: colors.surface },
  option: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: slate[100] },
  qaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: slate[100] },
  qaBtn: { width: 38, height: 34, borderRadius: radius.button, backgroundColor: slate[100], alignItems: 'center', justifyContent: 'center' },
  alert: { backgroundColor: danger[50], borderRadius: radius.button, padding: spacing.sm },
});
