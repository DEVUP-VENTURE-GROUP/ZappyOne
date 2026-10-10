/**
 * The larger pieces every provider job screen shares, the app's versions of
 * the websites' JobChat, GiveBackCard, RateCustomerCard, SOSButton,
 * ProofPhotos and AssignTechnician. Same calls, same rules (jobFlows).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Check, CheckCheck, Heart, MessageCircle, Phone, Send, ShieldAlert, Star, Undo2, UserPlus, UserX, X } from 'lucide-react-native';
import {
  api, useJobChatQuery, useSendJobChatMutation, useJobGiveBackQuery, useGiveBackJobMutation, useReportCustomerAbsentMutation,
  useRateCustomerMutation, useTriggerSOSMutation, useShopWorkersQuery, useAssignJobTechnicianMutation,
} from '@zappy/core/api';
import { CHAT_QUICK, rateOptions, PET_EMERGENCY_CONTACTS, isPetJob, minsUntil } from '@zappy/core/shared/jobFlows';
import { useAppDispatch, useAppSelector } from '@zappy/core/store/hooks';
import { useSocketEvent } from '@zappy/core/hooks/useSocketEvent';
import { getBestPosition } from '@zappy/core/hooks/useBestPosition';
import { pickPhoto, uploadPhoto } from '@zappy/core/lib/upload';
import { Button, Text } from '../components';
import { toast } from '../components/Toast';
import { colors, zappy, ink, slate, success, accent, danger } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { JobCard } from './parts';

const RIPPLE = { color: 'rgba(16,24,40,0.08)' };
type ApiErr = { data?: { code?: string; error?: string } };
const errText = (e: unknown, fallback: string) => (e as ApiErr)?.data?.error || fallback;

/* ── Chat ────────────────────────────────────────────────────────────── */

const clock = (at: string) => new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

function ChatSheet({ jobId, title, onClose }: { jobId: string; title: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const role = useAppSelector((s) => s.auth.role);
  const { data, isLoading } = useJobChatQuery(jobId, { refetchOnMountOrArgChange: true, pollingInterval: 10000 });
  const [send, { isLoading: sending }] = useSendJobChatMutation();
  const [text, setText] = useState('');
  const list = useRef<FlatList>(null);

  useSocketEvent('chat.message', (p) => {
    if (p?.jobId === String(jobId)) dispatch(api.util.invalidateTags([{ type: 'JobChat', id: jobId }] as never));
  });

  async function submit(body?: string) {
    const t = String(body ?? text).trim();
    if (!t) return;
    try {
      await send({ id: jobId, text: t }).unwrap();
      if (body == null) setText('');
    } catch (err) { toast.error(errText(err, 'Message not sent. Try again.')); }
  }

  const messages: { id: string; text: string; mine: boolean; at: string; readAt?: string | null }[] = data?.messages || [];
  const quick = CHAT_QUICK[role === 'user' ? 'user' : 'provider'];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.chat, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.chatHead}>
          <View style={[styles.circle, { backgroundColor: zappy[50] }]}><MessageCircle size={17} color={zappy[700]} /></View>
          <View style={styles.flex}>
            <Text variant="body" weight="bold" numberOfLines={1}>{title}</Text>
            <Text variant="caption" color={ink[500]}>Messages stay with this booking</Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10} style={styles.iconBtn}><X size={18} color={ink[700]} /></Pressable>
        </View>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text variant="bodySmall" color={ink[500]} style={styles.center}>
            {isLoading ? 'Loading…' : data?.open === false ? data.reason : 'No messages yet. Say hello or use a quick reply.'}
          </Text>}
          renderItem={({ item: m }) => (
            <View style={[styles.bubbleRow, m.mine ? styles.end : styles.start]}>
              <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
                <Text variant="body" color={m.mine ? '#fff' : ink[900]}>{m.text}</Text>
                <View style={styles.meta}>
                  <Text variant="caption" color={m.mine ? 'rgba(255,255,255,0.75)' : ink[400]}>{clock(m.at)}</Text>
                  {m.mine ? (m.readAt ? <CheckCheck size={13} color="rgba(255,255,255,0.75)" /> : <Check size={13} color="rgba(255,255,255,0.75)" />) : null}
                </View>
              </View>
            </View>
          )}
        />
        {data?.open === false ? (
          <Text variant="bodySmall" color={ink[500]} style={[styles.center, styles.closed]}>{data.reason}</Text>
        ) : (
          <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
              {quick.map((q: string) => (
                <Pressable key={q} onPress={() => submit(q)} disabled={sending} android_ripple={RIPPLE} style={styles.quickChip}>
                  <Text variant="bodySmall" weight="medium" color={ink[700]}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.inputRow}>
              <TextInput value={text} onChangeText={setText} maxLength={1000} placeholder="Type a message" placeholderTextColor={ink[400]}
                multiline style={styles.chatInput} accessibilityLabel="Message" />
              <Pressable onPress={() => submit()} disabled={sending || !text.trim()} accessibilityRole="button" accessibilityLabel="Send"
                style={[styles.sendBtn, (sending || !text.trim()) && styles.dim]}><Send size={17} color="#fff" /></Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ChatButton({ jobId, title = 'Your customer' }: { jobId?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  if (!jobId) return null;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.msgBtn}>
        <MessageCircle size={16} color={ink[900]} /><Text variant="bodySmall" weight="semibold">Message</Text>
      </Pressable>
      {open ? <ChatSheet jobId={jobId} title={title} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/* ── Hand back / customer not here ───────────────────────────────────── */

export function GiveBackCard({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());
  const { data, isFetching } = useJobGiveBackQuery({ id: jobId, reason: reason || 'other', status }, { skip: !jobId });
  const [giveBack, { isLoading: giving }] = useGiveBackJobMutation();
  const [reportAbsent, { isLoading: reporting }] = useReportCustomerAbsentMutation();
  const absent = data?.customerAbsent;
  useEffect(() => {
    if (!absent || absent.open) return undefined;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [absent]);

  if (!data || (!data.canGiveBack && !absent)) return null;
  const quote = data.quote;
  const waitLeft = minsUntil(absent?.opensAt, now);

  async function confirm() {
    if (!reason) { toast.error('Pick a reason first'); return; }
    if (reason === 'other' && note.trim().length < 5) { toast.error('Say in a few words why you cannot do it'); return; }
    try {
      const out = await giveBack({ id: jobId, reason, note: note.trim() }).unwrap();
      toast.success(out.toShop ? 'Sent back to your shop owner' : 'Handed back. We are finding someone else.');
      router.replace('/worker/work' as never);
    } catch (err) { toast.error(errText(err, 'Could not hand this job back')); }
  }

  function customerAbsent() {
    Alert.alert('Customer not here?', 'Close this job because the customer is not here? They are charged for the missed visit.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close the job', style: 'destructive', onPress: async () => {
        try {
          const out = await reportAbsent(jobId).unwrap();
          toast.success(out.message || 'Closed');
          router.replace('/worker/work' as never);
        } catch (err) { toast.error(errText(err, 'Could not close the job')); }
      } },
    ]);
  }

  return (
    <JobCard>
      {absent ? (
        <Button
          variant="outline"
          icon={<UserX size={15} color={ink[700]} />}
          label={absent.open || waitLeft === 0 ? 'Customer not here? Close the job' : `Customer not here? Available in ${waitLeft} min. Call them first.`}
          onPress={customerAbsent}
          disabled={(!absent.open && waitLeft > 0) || reporting}
          loading={reporting}
          fullWidth
        />
      ) : null}
      {data.canGiveBack && !open ? (
        <Pressable onPress={() => setOpen(true)} style={styles.inlineCenter} hitSlop={6}>
          <Undo2 size={15} color={ink[500]} /><Text variant="bodySmall" weight="semibold" color={ink[500]}>Can't do this job? Hand it back</Text>
        </Pressable>
      ) : null}
      {data.canGiveBack && open && quote ? (
        <View style={styles.gap}>
          <Text variant="bodySmall" weight="bold">Why can't you do it?</Text>
          <View style={styles.wrap}>
            {quote.reasons.map((r: { code: string; label: string }) => (
              <Pressable key={r.code} onPress={() => setReason(r.code)} accessibilityRole="radio" accessibilityState={{ selected: reason === r.code }}
                style={[styles.chip, reason === r.code && styles.chipOn]}>
                <Text variant="caption" weight="semibold" color={reason === r.code ? zappy[700] : ink[700]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          {reason === 'other' ? <TextInput value={note} onChangeText={setNote} maxLength={300} multiline placeholder="What happened?" placeholderTextColor={ink[400]} style={styles.textArea} /> : null}
          {reason ? (
            <View style={[styles.note, { backgroundColor: quote.penaltyPaise > 0 || quote.pauses ? accent[50] : slate[50] }]}>
              <Text variant="caption" color={quote.penaltyPaise > 0 || quote.pauses ? accent[700] : ink[700]}>{isFetching ? 'Checking…' : quote.message}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Button label="Keep the job" variant="outline" onPress={() => { setOpen(false); setReason(''); setNote(''); }} style={styles.flex} />
            <Button label="Hand it back" variant="danger" onPress={confirm} loading={giving} disabled={!reason || giving || isFetching} style={styles.flex} />
          </View>
        </View>
      ) : null}
    </JobCard>
  );
}

/* ── Rate the customer ───────────────────────────────────────────────── */

export function RateCustomerCard({ jobId, rated }: { jobId: string; rated?: boolean }) {
  const [rate, { isLoading }] = useRateCustomerMutation();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  if (rated || done) return <View style={styles.thanks}><Text variant="caption" color={ink[500]}>You rated this customer. Thank you.</Text></View>;
  const options = rateOptions(stars) as [string, string][];
  const toggle = (t: string) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));

  async function send() {
    try {
      const r = await rate({ id: jobId, stars, tags, note: note.trim() }).unwrap();
      toast.success(r.message);
      setDone(true);
    } catch (err) {
      if ((err as ApiErr)?.data?.code === 'ALREADY_RATED') setDone(true);
      toast.error(errText(err, 'Could not save the rating'));
    }
  }

  return (
    <JobCard>
      <Text variant="bodySmall" weight="bold">How was the customer?</Text>
      <Text variant="caption" color={ink[500]}>Private: they never see who rated them. It helps other pros, and ZappyOne steps in when someone is unsafe.</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => { setStars(n); setTags([]); }} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} hitSlop={4}>
            <Star size={32} color={n <= stars ? accent[500] : slate[300]} fill={n <= stars ? accent[500] : 'none'} />
          </Pressable>
        ))}
      </View>
      {stars > 0 ? (
        <>
          <View style={styles.wrap}>
            {options.map(([t, label]) => {
              const on = tags.includes(t);
              const unsafe = t === 'unsafe';
              return (
                <Pressable key={t} onPress={() => toggle(t)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  style={[styles.chip, on && (unsafe ? styles.chipRed : styles.chipDark), !on && unsafe && styles.chipRedLine]}>
                  {unsafe ? <ShieldAlert size={12} color={on ? '#fff' : danger[600]} /> : null}
                  <Text variant="caption" weight="semibold" color={on ? '#fff' : unsafe ? danger[600] : ink[700]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {stars <= 3 ? <TextInput value={note} onChangeText={setNote} maxLength={300} multiline placeholder="What happened? (optional, only ZappyOne reads this)" placeholderTextColor={ink[400]} style={styles.textArea} /> : null}
          <Button label="Send rating" onPress={send} loading={isLoading} fullWidth />
        </>
      ) : null}
    </JobCard>
  );
}

/* ── SOS ─────────────────────────────────────────────────────────────── */

const HOLD_MS = 3000;

export function SOSButton({ jobId, kind, service }: { jobId: string; kind: string; service?: string }) {
  const [triggerSOS] = useTriggerSOSMutation();
  const [holding, setHolding] = useState(false);
  const [left, setLeft] = useState(3);
  const [triggered, setTriggered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const pet = isPetJob(kind, service);

  function start() {
    if (triggered) return;
    setHolding(true);
    const t0 = Date.now();
    tick.current = setInterval(() => setLeft(Math.max(1, Math.ceil((HOLD_MS - (Date.now() - t0)) / 1000))), 200);
    timer.current = setTimeout(() => { stop(); void fire(); }, HOLD_MS);
  }
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    if (tick.current) clearInterval(tick.current);
    setHolding(false); setLeft(3);
  }
  async function fire() {
    // Send even without a fix: the server uses the last known position.
    const here = await getBestPosition({ windowMs: 4000 }).catch(() => null);
    try {
      await triggerSOS({ jobId, lat: here?.lat, lng: here?.lng, type: pet ? 'pet_emergency' : 'worker_sos' }).unwrap();
      setTriggered(true);
      toast.error(pet ? 'SOS sent. Your emergency contact and support are told. Vet contacts are below.' : 'SOS sent. Your emergency contact and support are told.', { duration: 8000 });
    } catch {
      toast.error('SOS failed to send. Call 112 immediately.');
    }
  }

  return (
    <View style={styles.gap}>
      <Text variant="caption" weight="semibold" color={ink[500]}>Feeling unsafe or need urgent help?</Text>
      <View style={styles.row}>
        <Pressable onPress={() => Linking.openURL('tel:112')} android_ripple={RIPPLE} accessibilityRole="button" style={styles.call112}>
          <Phone size={14} color="#fff" /><Text variant="bodySmall" weight="bold" color="#fff">Call 112</Text>
        </Pressable>
        <Pressable onPressIn={start} onPressOut={stop} accessibilityRole="button" accessibilityLabel="Hold for three seconds to send SOS"
          style={[styles.sos, triggered ? styles.sosDone : null]}>
          {pet ? <Heart size={14} color={triggered ? danger[600] : '#fff'} /> : <ShieldAlert size={14} color={triggered ? danger[600] : '#fff'} />}
          <Text variant="bodySmall" weight="bold" color={triggered ? danger[600] : '#fff'}>
            {triggered ? 'SOS active' : holding ? `Keep holding… ${left}s` : 'Hold 3s for SOS'}
          </Text>
        </Pressable>
      </View>
      {triggered && pet ? (
        <JobCard tone="red">
          <Text variant="caption" weight="extrabold" color={danger[600]}>PET EMERGENCY CONTACTS</Text>
          {PET_EMERGENCY_CONTACTS.map((c: { label: string; number: string; hint: string }) => (
            <View key={c.number} style={styles.between}>
              <View style={styles.flex}><Text variant="caption" weight="bold">{c.label}</Text><Text variant="caption" color={ink[500]}>{c.hint}</Text></View>
              <Pressable onPress={() => Linking.openURL(`tel:${c.number.replace(/[^0-9+]/g, '')}`)} style={styles.petCall}>
                <Phone size={11} color={danger[600]} /><Text variant="caption" weight="bold" color={danger[600]}>{c.number}</Text>
              </Pressable>
            </View>
          ))}
        </JobCard>
      ) : null}
    </View>
  );
}

/* ── Proof photos ────────────────────────────────────────────────────── */

export interface ProofPhoto { id: number; uri: string; key: string | null; uploading: boolean; error?: boolean }
export const readyKeys = (photos: ProofPhoto[] = []) => photos.filter((p) => p.key && !p.uploading && !p.error).map((p) => p.key as string);
export const photosSettled = (photos: ProofPhoto[] = []) => !photos.some((p) => p.uploading) && !photos.some((p) => p.error);

export function ProofPhotos({ photos, onChange, folder = 'order-proof', max = 3, title, hint, requiredNote = 'Minimum 1 photo required before marking complete' }: {
  photos: ProofPhoto[]; onChange: React.Dispatch<React.SetStateAction<ProofPhoto[]>>; folder?: string; max?: number; title?: string; hint?: string; requiredNote?: string;
}) {
  const ready = readyKeys(photos).length;
  const done = ready > 0;

  async function capture() {
    let picked;
    try { picked = await pickPhoto({ camera: true }); } catch (e) { toast.error((e as Error).message); return; }
    if (!picked) return;
    const id = Date.now();
    onChange((prev) => (prev.length >= max ? prev : [...prev, { id, uri: picked.uri, key: null, uploading: true }]));
    try {
      const key = await uploadPhoto(picked, folder);
      onChange((prev) => prev.map((p) => (p.id === id ? { ...p, key, uploading: false } : p)));
    } catch {
      // A failed upload stays marked, never mistaken for evidence that exists.
      onChange((prev) => prev.map((p) => (p.id === id ? { ...p, key: null, uploading: false, error: true } : p)));
      toast.error('Could not upload the photo. Check your connection and try again — if it keeps failing, contact support.');
    }
  }

  return (
    <View style={[styles.proof, done ? styles.proofDone : null]}>
      <View style={styles.row}>
        <View style={[styles.circle, { backgroundColor: done ? success[100] : zappy[50] }]}>
          {done ? <Check size={20} color={success[600]} /> : <Camera size={20} color={zappy[600]} />}
        </View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="extrabold" color={done ? success[700] : ink[900]}>{done ? 'Proof photos ready' : (title || 'Add proof-of-work photos')}</Text>
          <Text variant="caption" color={done ? success[600] : ink[500]}>{done ? `${ready} photo${ready > 1 ? 's' : ''} uploaded — you can add ${max - photos.length} more` : (hint || requiredNote)}</Text>
        </View>
        <View style={[styles.counter, { backgroundColor: done ? success[600] : zappy[100] }]}><Text variant="caption" weight="extrabold" color={done ? '#fff' : zappy[700]}>{ready}/{max}</Text></View>
      </View>
      {photos.length ? (
        <View style={styles.grid}>
          {photos.map((p) => (
            <View key={p.id} style={styles.thumbWrap}>
              <Image source={{ uri: p.uri }} style={[styles.thumb, { borderColor: p.error ? danger[400] : p.uploading ? zappy[300] : success[500] }]} accessibilityLabel="Proof photo" />
              {p.uploading ? <View style={styles.thumbVeil}><Text variant="caption" weight="bold" color="#fff">Uploading…</Text></View> : (
                <Pressable onPress={() => onChange((prev) => prev.filter((x) => x.id !== p.id))} accessibilityLabel="Remove photo" style={styles.thumbRemove} hitSlop={6}>
                  <X size={10} color="#fff" />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}
      {photos.length < max ? (
        <Button variant="outline" icon={<Camera size={17} color={ink[900]} />} label={photos.length === 0 ? 'Take proof photo' : 'Add another photo'} onPress={capture} fullWidth />
      ) : null}
    </View>
  );
}

/* One photo with a remove button (a helper's alternative item). */
export function PhotoField({ value, onChange, folder, label = 'photo' }: { value: string; onChange: (key: string) => void; folder: string; label?: string }) {
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function take() {
    try {
      const picked = await pickPhoto({ camera: true });
      if (!picked) return;
      setUri(picked.uri); setBusy(true);
      onChange(await uploadPhoto(picked, folder));
    } catch (e) { setUri(null); toast.error((e as Error).message || 'Could not upload the photo'); }
    finally { setBusy(false); }
  }
  return value || uri ? (
    <View style={styles.row}>
      {uri ? <Image source={{ uri }} style={styles.small} /> : null}
      <Text variant="caption" color={busy ? ink[500] : success[700]} style={styles.flex}>{busy ? 'Uploading…' : `${label} added`}</Text>
      <Pressable onPress={() => { setUri(null); onChange(''); }} hitSlop={8}><X size={16} color={ink[500]} /></Pressable>
    </View>
  ) : <Button variant="outline" size="small" icon={<Camera size={15} color={ink[900]} />} label={`Add ${label}`} onPress={take} />;
}

/* ── A shop owner hands a job to a technician ────────────────────────── */

export function AssignTechnician({ jobId, workerId, onDone, startOpen = false }: { jobId: string; workerId?: string | null; onDone?: () => void; startOpen?: boolean }) {
  const { data } = useShopWorkersQuery();
  const [assign, { isLoading }] = useAssignJobTechnicianMutation();
  const [open, setOpen] = useState(startOpen);
  type W = { _id: string; name: string; isOnline?: boolean; isBlocked?: boolean };
  const workers: W[] = [...(data?.workers || [])].filter((w: W) => !w.isBlocked).sort((a: W, b: W) => Number(!!b.isOnline) - Number(!!a.isOnline));
  const current = workers.find((w) => String(w._id) === String(workerId));

  async function give(id: string) {
    try {
      const res = await assign({ id: jobId, workerId: id }).unwrap();
      toast.success(`${res.workerName || 'Technician'} has the job — they have been told`);
      setOpen(false);
      onDone?.();
    } catch (err) { toast.error(errText(err, 'Could not assign that technician')); }
  }
  if (!data) return null;
  if (!workers.length) return <Text variant="caption" color={ink[400]}>Add technicians to your team to hand jobs to them.</Text>;
  return (
    <View style={styles.gap}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.row} hitSlop={6}>
        <UserPlus size={13} color={zappy[600]} /><Text variant="caption" weight="bold" color={zappy[600]}>{current ? `On ${current.name} · change` : 'Assign a technician'}</Text>
      </Pressable>
      {open ? workers.map((w) => {
        const isCurrent = String(w._id) === String(workerId);
        return (
          <Pressable key={w._id} onPress={() => give(w._id)} disabled={isLoading || isCurrent} android_ripple={RIPPLE}
            style={[styles.tech, isCurrent ? { borderColor: success[100], backgroundColor: success[50] } : null]}>
            <View style={[styles.onlineDot, { backgroundColor: w.isOnline ? success[500] : slate[300] }]} />
            <Text variant="bodySmall" weight="semibold" style={styles.flex} numberOfLines={1}>{w.name}</Text>
            <Text variant="caption" color={ink[400]}>{w.isOnline ? 'online' : 'offline'}</Text>
            {isCurrent ? <Check size={13} color={success[600]} /> : null}
          </Pressable>
        );
      }) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  gap: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  center: { textAlign: 'center', paddingVertical: spacing.xxl },
  dim: { opacity: 0.5 },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  msgBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 40 },
  chat: { flex: 1, backgroundColor: colors.background },
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  chatList: { padding: spacing.base, gap: spacing.sm, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row' },
  start: { justifyContent: 'flex-start' },
  end: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.medium, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  mine: { backgroundColor: zappy[600], borderBottomRightRadius: radius.small },
  theirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: radius.small },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  closed: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.md },
  composer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm },
  quick: { gap: spacing.sm, paddingHorizontal: spacing.md },
  quickChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 34, justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900] },
  sendBtn: { width: 44, height: 44, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  inlineCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 36, backgroundColor: colors.surface },
  chipOn: { borderColor: zappy[600], backgroundColor: zappy[50] },
  chipDark: { borderColor: ink[900], backgroundColor: ink[900] },
  chipRed: { borderColor: danger[600], backgroundColor: danger[600] },
  chipRedLine: { borderColor: danger[100] },
  textArea: { minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], textAlignVertical: 'top' },
  note: { borderRadius: radius.button, padding: spacing.md },
  thanks: { backgroundColor: slate[50], borderRadius: radius.medium, padding: spacing.md },
  stars: { flexDirection: 'row', gap: 6 },
  call112: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ink[700], borderRadius: radius.medium, minHeight: 48 },
  sos: { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: danger[600], borderRadius: radius.medium, minHeight: 48 },
  sosDone: { backgroundColor: danger[50], borderWidth: 1, borderColor: danger[100] },
  petCall: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: danger[100], borderRadius: radius.button, paddingHorizontal: spacing.sm, minHeight: 32 },
  proof: { backgroundColor: zappy[50], borderRadius: radius.medium, borderWidth: 1, borderColor: zappy[100], padding: spacing.base, gap: spacing.md },
  proofDone: { backgroundColor: success[50], borderColor: success[100] },
  counter: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  grid: { flexDirection: 'row', gap: spacing.sm },
  thumbWrap: { width: '31%', aspectRatio: 1 },
  thumb: { width: '100%', height: '100%', borderRadius: radius.medium, borderWidth: 2 },
  thumbVeil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.medium, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  thumbRemove: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  small: { width: 44, height: 44, borderRadius: radius.button },
  tech: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 44 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
});
