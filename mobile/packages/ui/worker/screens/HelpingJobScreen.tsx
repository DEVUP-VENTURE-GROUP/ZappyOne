/**
 * A helping task (errands: buy, pick up, return, exchange), for the helper
 * doing it (the websites' WorkerHelpingJobPage): steps with the start code,
 * an arrival photo, each item bought / not found / an alternative for the
 * customer to approve, money fronted at the till, the handover for returns,
 * then payment and completion. Rules are the shared jobFlows logic.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowLeft, Banknote, Check, X } from 'lucide-react-native';
import {
  useGetHelpingTaskQuery, useAdvanceHelpingStatusMutation, useUpdateHelpingItemMutation, useProposeHelpingAlternativeMutation,
  useRecordHelpingAdvanceMutation, useAddHelpingProofMutation, useRecordHelpingHandoverMutation, useCompleteHelpingTaskMutation,
  useCollectHelpingCashMutation,
} from '@zappy/core/api';
import {
  helpingPaidAt, helpingFinishesAt, helpingMoveLabel, helpingNextMoves, helpingItemDone, isReturnTask,
  HELPING_DONE, HELPING_NO_SOS, HELPING_HANDED, tripOf, pointOf,
} from '@zappy/core/shared/jobFlows';
import { formatPaise, billTipPaise } from '@zappy/core/shared/money';
import { useTripPublish } from '@zappy/core/hooks/useJobTrip';
import { Button, EmptyState, LoadingState, Text } from '../../components';
import { toast } from '../../components/Toast';
import { colors, zappy, ink, slate, success, accent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { JobCard, Eyebrow, OnSiteCard, TripBanner, JobMapCard, CollectPaymentCard, JobEarningsCard, useStartCodeGate } from '../../jobs/parts';
import { ChatButton, GiveBackCard, RateCustomerCard, SOSButton, ProofPhotos, PhotoField, readyKeys, type ProofPhoto } from '../../jobs/kit';

type ApiErr = { data?: { error?: string; code?: string } };
const errText = (e: unknown, f: string) => (e as ApiErr)?.data?.error || f;
type Item = { _id: string; name: string; quantity: number; status: string; preferredBrand?: string; preferredVariant?: string; maxApprovedPricePaise?: number };
type Task = { _id: string; status: string; serviceType: string; title?: string; reference?: string; items?: Item[]; approvals?: { status: string }[];
  instructions?: string; onSite?: object; itemMoney?: { paymentModel?: string }; returnDetail?: { merchantInstructions?: string };
  pickupLocation?: object; paymentMethod?: string; customerRating?: { stars?: number } };

function ItemRow({ item, disabled, onPurchase, onUnavailable, onAlternative }: {
  item: Item; disabled: boolean; onPurchase: (price: number) => void; onUnavailable: (status: string) => void;
  onAlternative: (alt: { name: string; pricePaise: number; quantity: number; photoKey: string; note: string }) => void;
}) {
  const [price, setPrice] = useState('');
  const [showAlt, setShowAlt] = useState(false);
  const [alt, setAlt] = useState({ name: '', price: '', photoKey: '' });
  const done = helpingItemDone(item);
  return (
    <JobCard>
      <View style={styles.between}>
        <View style={styles.flex}>
          <Text variant="body" weight="bold">{item.name} × {item.quantity}</Text>
          {item.preferredBrand || item.preferredVariant ? <Text variant="caption" color={ink[400]}>{[item.preferredBrand, item.preferredVariant].filter(Boolean).join(' · ')}</Text> : null}
          <Text variant="caption" color={ink[500]}>Max: {formatPaise(item.maxApprovedPricePaise)}</Text>
        </View>
        <Text variant="caption" weight="bold" color={zappy[500]}>{item.status.replace(/_/g, ' ').toUpperCase()}</Text>
      </View>
      {!done && !disabled ? (
        <>
          <View style={styles.row}>
            <TextInput value={price} onChangeText={(v) => setPrice(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="Price paid (₹)" placeholderTextColor={ink[400]} style={[styles.input, styles.flex]} />
            <Button label="Bought" variant="success" icon={<Check size={14} color="#fff" />} onPress={() => price && onPurchase(Number(price))} />
          </View>
          <View style={styles.row}>
            <Button label="Not found" variant="outline" icon={<X size={13} color={ink[900]} />} onPress={() => onUnavailable('not_found')} style={styles.flex} />
            <Button label="Propose alternative" variant="outline" onPress={() => setShowAlt((v) => !v)} style={styles.flex} />
          </View>
        </>
      ) : null}
      {showAlt && !done ? (
        <View style={styles.alt}>
          <TextInput value={alt.name} onChangeText={(v) => setAlt((a) => ({ ...a, name: v }))} placeholder="Alternative product name" placeholderTextColor={ink[400]} style={styles.input} />
          <TextInput value={alt.price} onChangeText={(v) => setAlt((a) => ({ ...a, price: v.replace(/[^\d.]/g, '') }))} keyboardType="decimal-pad" placeholder="Its price (₹)" placeholderTextColor={ink[400]} style={styles.input} />
          <PhotoField value={alt.photoKey} onChange={(k) => setAlt((a) => ({ ...a, photoKey: k }))} folder="helping/alternatives" label="photo of the item" />
          <Button label="Send to customer for approval" disabled={!alt.name || !alt.price}
            onPress={() => { onAlternative({ name: alt.name, pricePaise: Math.round(Number(alt.price || 0) * 100), quantity: item.quantity, photoKey: alt.photoKey, note: '' }); setShowAlt(false); }} fullWidth />
        </View>
      ) : null}
    </JobCard>
  );
}

function ShoppingExecution({ task, onChanged, disabled }: { task: Task; onChanged: () => void; disabled: boolean }) {
  const [updateItem] = useUpdateHelpingItemMutation();
  const [proposeAlt] = useProposeHelpingAlternativeMutation();
  const [recordAdvance] = useRecordHelpingAdvanceMutation();
  const [advanceAmount, setAdvanceAmount] = useState('');
  if (!(task.items || []).length) return null;

  async function markPurchased(item: Item, price: number) {
    try {
      await updateItem({ id: task._id, itemId: item._id, status: 'purchased', actualPricePaise: Math.round(price * 100) }).unwrap();
      toast.success('Marked purchased'); onChanged();
    } catch (err) {
      if ((err as ApiErr)?.data?.code === 'APPROVAL_REQUIRED') toast.error('That price is above what the customer approved — propose it as an alternative instead');
      else toast.error(errText(err, 'Could not save this'));
    }
  }
  async function markUnavailable(item: Item, status: string) {
    try { await updateItem({ id: task._id, itemId: item._id, status, reason: 'Not available in store' }).unwrap(); onChanged(); }
    catch (err) { toast.error(errText(err, 'Could not save this')); }
  }
  async function sendAdvance() {
    if (!advanceAmount) return;
    try {
      await recordAdvance({ id: task._id, amountPaise: Math.round(Number(advanceAmount) * 100) }).unwrap();
      toast.success('Advance recorded — you will be reimbursed on settlement'); setAdvanceAmount(''); onChanged();
    } catch (err) { toast.error(errText(err, 'That is more than the advance limit — the customer must fund it')); }
  }

  return (
    <View style={styles.gap}>
      {(task.items || []).map((item) => (
        <ItemRow key={item._id} item={item} disabled={disabled}
          onPurchase={(p) => markPurchased(item, p)} onUnavailable={(s) => markUnavailable(item, s)}
          onAlternative={(alt) => proposeAlt({ id: task._id, itemId: item._id, ...alt }).unwrap()
            .then(() => { toast.success('Sent for approval'); onChanged(); })
            .catch((err: unknown) => toast.error(errText(err, 'Could not send this')))} />
      ))}
      {task.itemMoney?.paymentModel === 'worker_advance' ? (
        <JobCard>
          <View style={styles.row}><Banknote size={13} color={ink[500]} /><Eyebrow>YOU'RE FRONTING THIS PURCHASE</Eyebrow></View>
          <View style={styles.row}>
            <TextInput value={advanceAmount} onChangeText={(v) => setAdvanceAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="Amount paid at till (₹)" placeholderTextColor={ink[400]} style={[styles.input, styles.flex]} />
            <Button label="Record" onPress={sendAdvance} />
          </View>
          <Text variant="caption" color={ink[400]}>You'll be reimbursed exactly this amount when the task settles.</Text>
        </JobCard>
      ) : null}
    </View>
  );
}

function ReturnExecution({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [proofs, setProofs] = useState<ProofPhoto[]>([]);
  const [tracking, setTracking] = useState('');
  const [ack, setAck] = useState('');
  const [handover, { isLoading }] = useRecordHelpingHandoverMutation();
  const [addProof] = useAddHelpingProofMutation();

  async function submit() {
    const keys = readyKeys(proofs);
    if (!keys.length) { toast.error('At least one photo of the handover is needed'); return; }
    try {
      await Promise.all(keys.map((k) => addProof({ id: task._id, kind: 'merchant_acknowledgement', key: k }).unwrap()));
      await handover({ id: task._id, trackingNumber: tracking, acknowledgement: ack, proofKeys: keys }).unwrap();
      toast.success('Handover recorded'); onChanged();
    } catch (err) { toast.error(errText(err, 'Could not record the handover')); }
  }

  if (HELPING_HANDED.includes(task.status)) {
    return <JobCard tone="green"><Text variant="bodySmall" color={success[700]}>Handover recorded — the merchant's own process takes it from here.</Text></JobCard>;
  }
  if (!['RETURNING', 'AT_DROPOFF'].includes(task.status)) return null;
  return (
    <JobCard>
      <Eyebrow>HANDOVER</Eyebrow>
      {task.returnDetail?.merchantInstructions ? <View style={styles.soft}><Text variant="caption" color={ink[500]}>{task.returnDetail.merchantInstructions}</Text></View> : null}
      <ProofPhotos photos={proofs} onChange={setProofs} folder="helping/handover" max={3} title="Handover / receipt photo" hint="A courier receipt, store acknowledgement, or clear handover photo." />
      <TextInput value={tracking} onChangeText={setTracking} placeholder="Tracking / AWB number (if any)" placeholderTextColor={ink[400]} style={styles.input} />
      <TextInput value={ack} onChangeText={setAck} placeholder="Merchant acknowledgement (if any)" placeholderTextColor={ink[400]} style={styles.input} />
      <Button label="Confirm handover" onPress={submit} loading={isLoading} fullWidth />
    </JobCard>
  );
}

export function HelpingJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useGetHelpingTaskQuery(id, { pollingInterval: 10000 });
  const [advance] = useAdvanceHelpingStatusMutation();
  const [addProof] = useAddHelpingProofMutation();
  const [complete, { isLoading: completing }] = useCompleteHelpingTaskMutation();
  const [collectCash, { isLoading: collecting }] = useCollectHelpingCashMutation();
  const [arrival, setArrival] = useState<ProofPhoto[]>([]);
  const gate = useStartCodeGate();
  const task: Task | undefined = data?.task;
  const trip = tripOf('helping', task);
  const sharing = useTripPublish(id, Boolean(trip));

  if (isLoading) return <View style={styles.page}><LoadingState /></View>;
  if (!task) return <View style={[styles.page, styles.center]}><EmptyState title="Task not found" actionLabel="Back to work" onAction={() => router.replace('/worker/work' as never)} /></View>;

  const isReturn = isReturnTask(task);
  const pendingApproval = (task.approvals || []).some((a) => a.status === 'pending');
  const due = data.due || { totalPaise: 0, itemsPending: false };
  const nextMoves: string[] = helpingNextMoves(task, due, pendingApproval);
  const settledUp = due.totalPaise <= 0 && !due.itemsPending;

  async function move(status: string) {
    try {
      if (status === 'TASK_STARTED' && readyKeys(arrival).length) {
        await Promise.all(readyKeys(arrival).map((key) => addProof({ id: task!._id, kind: 'arrival', key }).unwrap()));
      }
      await gate.run((code) => advance({ id: task!._id, status, code }).unwrap().then((r: unknown) => { refetch(); return r; }));
    } catch (err) { toast.error(errText(err, 'Could not update the task')); }
  }
  async function finish() {
    try {
      await gate.run((code) => complete({ id: task!._id, code }).unwrap().then((r: unknown) => {
        toast.success('Task completed and settled'); router.replace('/worker/work' as never); return r;
      }));
    } catch (err) { toast.error(errText(err, 'Could not complete the task')); }
  }
  async function recordCash() {
    try { await collectCash(task!._id).unwrap(); toast.success('Service fee recorded'); refetch(); }
    catch (err) { toast.error(errText(err, 'Could not record the payment')); }
  }

  return (
    <View style={styles.page}>
      {gate.prompt}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/worker/work' as never))} accessibilityLabel="Back" hitSlop={8} style={styles.back}><ArrowLeft size={20} color={ink[900]} /></Pressable>
        <View style={styles.flex}>
          <Text variant="body" weight="bold" numberOfLines={1}>{task.title || task.reference}</Text>
          <Text variant="caption" color={ink[400]}>{task.status.replace(/_/g, ' ')}</Text>
        </View>
        <ChatButton jobId={task._id} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxxl }]} keyboardShouldPersistTaps="handled">
        {trip ? <TripBanner sharing={sharing} to={trip.to} toCustomer={trip.toCustomer} /> : null}
        <OnSiteCard onSite={task.onSite as never} />
        <GiveBackCard jobId={task._id} status={task.status} />
        {!HELPING_DONE.includes(task.status) && !['CANCELLED', 'FAILED'].includes(task.status) ? <JobMapCard to={pointOf(task.pickupLocation)} label="Pickup" /> : null}
        {task.instructions ? <JobCard><Text variant="bodySmall" color={ink[700]}>{task.instructions}</Text></JobCard> : null}

        {nextMoves.map((s) => <Button key={s} label={helpingMoveLabel(s, task)} onPress={() => move(s)} fullWidth size="large" />)}

        {task.status === 'ARRIVED' ? (
          <ProofPhotos photos={arrival} onChange={setArrival} folder="helping/arrival" max={2} title="Arrival photo" hint="A quick photo confirms you're at the right place." />
        ) : null}

        {isReturn ? <ReturnExecution task={task} onChanged={refetch} /> : <ShoppingExecution task={task} onChanged={refetch} disabled={pendingApproval} />}

        {pendingApproval ? (
          <JobCard tone="amber" style={styles.row}>
            <AlertTriangle size={14} color={accent[700]} />
            <Text variant="caption" color={accent[700]} style={styles.flex}>Waiting on the customer's decision. You'll be notified the moment they answer.</Text>
          </JobCard>
        ) : null}

        {['IN_PROGRESS', 'AT_DROPOFF', 'HANDED_OVER'].includes(task.status) && !pendingApproval && due.itemsPending ? (
          <JobCard><Text variant="caption" color={ink[700]}>Mark every item as bought or unavailable. The customer's bill is worked out from your receipts.</Text></JobCard>
        ) : null}

        {helpingPaidAt(task).includes(task.status) && !pendingApproval && !due.itemsPending && due.totalPaise > 0 ? (
          <CollectPaymentCard amountPaise={due.totalPaise} tipPaise={billTipPaise(task)} paymentMethod={due.feePaise > 0 ? task.paymentMethod : 'cash'}
            paid={false} collecting={collecting} onCollect={recordCash} what={due.itemsPaise > 0 ? 'items and service fee' : 'service fee'} />
        ) : null}

        {helpingFinishesAt(task).includes(task.status) && !pendingApproval && settledUp
          ? <Button label="Complete task" variant="success" onPress={finish} loading={completing} fullWidth size="large" /> : null}
        {HELPING_DONE.includes(task.status) ? <JobEarningsCard jobId={task._id} /> : null}
        {HELPING_DONE.includes(task.status) ? <RateCustomerCard jobId={task._id} rated={!!task.customerRating?.stars} /> : null}
        {!HELPING_NO_SOS.includes(task.status) ? <SOSButton jobId={task._id} kind="helping" service={task.serviceType} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  gap: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  body: { padding: spacing.base, gap: spacing.md },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  alt: { backgroundColor: accent[50], borderRadius: radius.button, padding: spacing.md, gap: spacing.sm },
  soft: { backgroundColor: slate[50], borderRadius: radius.button, padding: spacing.md },
});
