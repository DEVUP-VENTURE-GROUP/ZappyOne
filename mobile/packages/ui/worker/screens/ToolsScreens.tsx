/**
 * Provider tools from the menu, ported from the websites:
 *   WorkerHoursScreen   (WorkerHoursPage)      when bookings for later can be matched
 *   ReviewsScreen       (ProviderReviewsPage)  rating, breakdown, report a review
 *   AppealsScreen       (WorkerAppealsPage)    file and follow appeals
 */
import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarOff, Clock, Flag, Minus, Plus, Scale, X, EyeOff, MessageSquare, MessagesSquare, Star } from 'lucide-react-native';
import {
  useWorkerHoursQuery, useSaveWorkerHoursMutation, useMyReviewsQuery, useReportReviewMutation,
  useGetWorkerAppealsQuery, useCreateWorkerAppealMutation,
} from '@zappy/core/api';
import { Button, EmptyState, ErrorState, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { colors, zappy, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const RIPPLE = { color: 'rgba(16,24,40,0.08)' };
type ApiErr = { data?: { error?: string } };
const errText = (e: unknown, f: string) => (e as ApiErr)?.data?.error || f;

/* ── My hours ────────────────────────────────────────────────────────── */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_WEEK = DAYS.map((_, day) => ({ day, on: day !== 0, from: '09:00', to: '19:00' }));
/** Today in India, as YYYY-MM-DD. */
const istKey = (offsetDays = 0) => new Date(Date.now() + 330 * 60000 + offsetDays * 86400000).toISOString().slice(0, 10);
const step = (hhmm: string, by: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const mins = Math.min(23 * 60 + 30, Math.max(0, h * 60 + m + by));
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};
const ampm = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

function TimeStepper({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <View style={styles.stepper} accessibilityLabel={`${label} ${ampm(value)}`}>
      <Pressable onPress={() => onChange(step(value, -30))} hitSlop={6} accessibilityLabel={`${label} earlier`} style={styles.stepBtn}><Minus size={14} color={ink[700]} /></Pressable>
      <Text variant="bodySmall" weight="semibold" style={styles.stepText}>{ampm(value)}</Text>
      <Pressable onPress={() => onChange(step(value, 30))} hitSlop={6} accessibilityLabel={`${label} later`} style={styles.stepBtn}><Plus size={14} color={ink[700]} /></Pressable>
    </View>
  );
}

export function WorkerHoursScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useWorkerHoursQuery();
  const [save, { isLoading: saving }] = useSaveWorkerHoursMutation();
  const [week, setWeek] = useState(DEFAULT_WEEK);
  const [daysOff, setDaysOff] = useState<string[]>([]);
  const [acceptLater, setAcceptLater] = useState(true);

  useEffect(() => {
    const h = data?.hours;
    if (h?.week?.length) { setWeek(h.week); setDaysOff(h.daysOff || []); setAcceptLater(h.acceptLater !== false); }
  }, [data]);

  const setDay = (day: number, patch: object) => setWeek((w) => w.map((d) => (d.day === day ? { ...d, ...patch } : d)));
  const toggleOff = (k: string) => setDaysOff((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k].sort()));
  const next60 = Array.from({ length: 60 }, (_, i) => istKey(i));

  async function submit() {
    try { const r = await save({ week, daysOff, acceptLater }).unwrap(); toast.success(r.message); }
    catch (err) { toast.error(errText(err, 'Could not save your hours')); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="My hours" safeArea />
      {isLoading ? <LoadingState /> : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.info}><Text variant="caption" color={zappy[800]}>
            Customers who book for later are matched to you only inside these hours, even when you are offline, and never on your days off. Jobs for right now still need you online.
          </Text></View>
          <View style={styles.card}>
            {week.map((d) => (
              <View key={d.day} style={styles.dayRow}>
                <Switch value={d.on} onValueChange={(on) => setDay(d.day, { on })} accessibilityLabel={`${DAYS[d.day]} working`} />
                <Text variant="bodySmall" weight="semibold" color={d.on ? ink[900] : ink[400]} style={styles.dayName}>{DAYS[d.day]}</Text>
                {d.on ? (
                  <View style={styles.times}>
                    <TimeStepper value={d.from} onChange={(from) => setDay(d.day, { from })} label={`${DAYS[d.day]} from`} />
                    <TimeStepper value={d.to} onChange={(to) => setDay(d.day, { to })} label={`${DAYS[d.day]} to`} />
                  </View>
                ) : <Text variant="caption" color={ink[400]}>Not working</Text>}
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <View style={styles.row}><CalendarOff size={15} color={ink[900]} /><Text variant="bodySmall" weight="bold">Days off</Text></View>
            <Text variant="caption" color={ink[500]}>Tap the days you won't work.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>
              {next60.map((k) => {
                const on = daysOff.includes(k);
                const d = new Date(`${k}T00:00:00`);
                return (
                  <Pressable key={k} onPress={() => toggleOff(k)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    accessibilityLabel={d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} style={[styles.date, on && styles.dateOn]}>
                    <Text variant="caption" color={on ? '#fff' : ink[500]}>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</Text>
                    <Text variant="body" weight="bold" color={on ? '#fff' : ink[900]}>{d.getDate()}</Text>
                    <Text variant="caption" color={on ? '#fff' : ink[500]}>{d.toLocaleDateString('en-IN', { month: 'short' })}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View style={[styles.card, styles.row]}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold">Take bookings for later while I am offline</Text>
              <Text variant="caption" color={ink[500]}>We send you a notification for each one inside your hours.</Text>
            </View>
            <Switch value={acceptLater} onValueChange={setAcceptLater} accessibilityLabel="Take bookings for later while offline" />
          </View>
        </ScrollView>
      )}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Save my hours" onPress={submit} loading={saving} disabled={isLoading} fullWidth size="large" />
      </View>
    </View>
  );
}

/* ── Reviews ─────────────────────────────────────────────────────────── */

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={styles.row} accessibilityLabel={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} color={n <= value ? accent[500] : slate[300]} fill={n <= value ? accent[500] : 'none'} />)}
    </View>
  );
}

type Review = { id: string; rating: number; by: string; service?: string; at: string; text?: string; reported?: boolean; hidden?: boolean; excluded?: boolean };

function ReportBox({ review, onDone }: { review: Review; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [report, { isLoading }] = useReportReviewMutation();
  async function send() {
    try { await report({ id: review.id, reason: reason.trim() }).unwrap(); toast.success('Sent for review. We will look at it and let you know.'); onDone(); }
    catch (err) { toast.error(errText(err, 'That did not go through. Please try again.')); }
  }
  return (
    <View style={styles.gap}>
      <TextInput value={reason} onChangeText={setReason} maxLength={300} multiline placeholder="What is wrong with this review? For example: I did not do this job."
        placeholderTextColor={ink[400]} style={styles.area} accessibilityLabel="Why you are reporting this review" />
      <View style={styles.row}>
        <Button label="Send" size="small" onPress={send} loading={isLoading} disabled={reason.trim().length < 5} />
        <Button label="Cancel" size="small" variant="outline" onPress={onDone} />
      </View>
    </View>
  );
}

export function ReviewsScreen() {
  const [page, setPage] = useState(1);
  const [reporting, setReporting] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useMyReviewsQuery(page);
  const total: number = data?.reviewCount || 0;
  const reviews: Review[] = data?.reviews || [];

  return (
    <View style={styles.page}>
      <ScreenHeader title="My reviews" safeArea />
      {isLoading ? <LoadingState /> : isError ? <ErrorState message="Your reviews did not load." onRetry={refetch} /> : (
        <FlatList
          data={reviews}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.body}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListHeaderComponent={
            <View style={[styles.card, styles.summary]}>
              <View style={styles.centerCol}>
                <Text variant="display" weight="extrabold">{total ? Number(data.rating).toFixed(1) : '—'}</Text>
                <Stars value={Math.round(data?.rating || 0)} />
                <Text variant="caption" color={ink[500]}>{total ? `${total} review${total === 1 ? '' : 's'}` : 'No reviews yet'}</Text>
              </View>
              <View style={styles.flex}>
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = data?.breakdown?.[n] || 0;
                  return (
                    <View key={n} style={styles.row}>
                      <Text variant="caption" color={ink[500]} style={{ width: 10 }}>{n}</Text>
                      <View style={styles.bar}><View style={[styles.barFill, { width: `${total ? (c / total) * 100 : 0}%` }]} /></View>
                      <Text variant="caption" color={ink[500]} style={{ width: 24, textAlign: 'right' }}>{c}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState title="No reviews yet" message="Customers can rate you after each finished job. Their reviews show here." icon={<MessageSquare size={24} color={ink[400]} />} />}
          renderItem={({ item: r }) => (
            <View style={styles.card}>
              <View style={styles.between}>
                <View style={styles.flex}>
                  <Stars value={r.rating} />
                  <Text variant="caption" color={ink[500]}>{r.by}{r.service ? ` · ${r.service}` : ''} · {new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                </View>
                {!r.reported && reporting !== r.id ? (
                  <Pressable onPress={() => setReporting(r.id)} hitSlop={8} style={styles.row}><Flag size={13} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[500]}>Report</Text></Pressable>
                ) : null}
              </View>
              {r.text ? <Text variant="bodySmall">{r.text}</Text> : null}
              <View style={styles.wrap}>
                {r.reported ? <View style={[styles.tag, { backgroundColor: accent[50] }]}><Text variant="caption" weight="semibold" color={accent[700]}>Reported · being looked at</Text></View> : null}
                {r.hidden ? <View style={styles.tag}><EyeOff size={11} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[500]}>Not shown to customers</Text></View> : null}
                {r.excluded ? <View style={styles.tag}><Text variant="caption" weight="semibold" color={ink[500]}>Not counted in your rating</Text></View> : null}
              </View>
              {reporting === r.id ? <ReportBox review={r} onDone={() => setReporting(null)} /> : null}
            </View>
          )}
          ListFooterComponent={data?.pages > 1 ? (
            <View style={[styles.between, { marginTop: spacing.md }]}>
              <Button label="Newer" size="small" variant="outline" disabled={page <= 1} onPress={() => setPage((p) => p - 1)} />
              <Text variant="caption" color={ink[500]}>Page {page} of {data.pages}</Text>
              <Button label="Older" size="small" variant="outline" disabled={page >= data.pages} onPress={() => setPage((p) => p + 1)} />
            </View>
          ) : null}
        />
      )}
    </View>
  );
}

/* ── Appeals ─────────────────────────────────────────────────────────── */

const APPEAL_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Pending review', bg: accent[50], fg: accent[700] },
  under_review: { label: 'Under review', bg: zappy[50], fg: zappy[700] },
  upheld: { label: 'Upheld (won)', bg: success[50], fg: success[700] },
  dismissed: { label: 'Dismissed', bg: danger[50], fg: danger[600] },
};
const TYPE_OPTS = ['rating', 'penalty', 'cancellation', 'pause', 'dues', 'verification', 'order_issue'];
const TYPE_LABELS: Record<string, string> = {
  rating: 'A rating or review', penalty: 'A penalty or fine', cancellation: 'A cancellation', pause: 'Being taken offline',
  dues: 'My dues or payments', verification: 'My verification', order_issue: 'Something about a job',
};

function NewAppealSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ type: 'rating', subject: '', description: '', jobRef: '' });
  const [create, { isLoading }] = useCreateWorkerAppealMutation();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  async function submit() {
    if (!form.subject.trim()) { toast.error('Add a subject'); return; }
    if (form.description.length < 30) { toast.error('Please describe the issue in at least 30 characters'); return; }
    try { await create(form).unwrap(); toast.success('Appeal submitted'); onClose(); }
    catch (err) { toast.error(errText(err, 'Failed to submit appeal. Please try again.')); }
  }
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={[styles.between, styles.sheetHead]}>
          <Text variant="heading3" weight="black">File an appeal</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><X size={20} color={ink[700]} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <Text variant="caption" weight="black" color={ink[400]}>WHAT IS THIS ABOUT?</Text>
          <View style={styles.wrap}>
            {TYPE_OPTS.map((t) => (
              <Pressable key={t} onPress={() => set('type', t)} accessibilityRole="radio" accessibilityState={{ selected: form.type === t }} style={[styles.choice, form.type === t && styles.choiceOn]}>
                <Text variant="caption" weight="bold" color={form.type === t ? zappy[700] : ink[700]}>{TYPE_LABELS[t]}</Text>
              </Pressable>
            ))}
          </View>
          <Text variant="caption" weight="black" color={ink[400]}>SUBJECT</Text>
          <TextInput value={form.subject} onChangeText={(v) => set('subject', v)} placeholder="e.g. Unfair 1-star rating from customer" placeholderTextColor={ink[400]} style={styles.input} />
          <Text variant="caption" weight="black" color={ink[400]}>BOOKING REFERENCE (OPTIONAL)</Text>
          <TextInput value={form.jobRef} onChangeText={(v) => set('jobRef', v.toUpperCase())} maxLength={40} autoCapitalize="characters" placeholder="e.g. ZR5ZRJXCRP, on the job screen" placeholderTextColor={ink[400]} style={styles.input} />
          <View style={styles.between}>
            <Text variant="caption" weight="black" color={ink[400]}>WHAT HAPPENED</Text>
            <Text variant="caption" weight="bold" color={form.description.length < 30 ? accent[600] : success[600]}>{form.description.length}/30 min</Text>
          </View>
          <TextInput value={form.description} onChangeText={(v) => set('description', v)} multiline placeholder="Describe exactly what happened and why you are appealing. Details help us review faster."
            placeholderTextColor={ink[400]} style={[styles.area, { minHeight: 120 }]} />
          <View style={[styles.info, styles.row]}><Clock size={16} color={zappy[500]} /><Text variant="caption" color={zappy[800]} style={styles.flex}>Our support team reviews appeals within 2-3 business days. We will notify you once a decision is made.</Text></View>
          <Button label="Submit appeal" onPress={submit} loading={isLoading} disabled={form.description.length < 30} fullWidth size="large" />
        </ScrollView>
      </View>
    </Modal>
  );
}

type Appeal = { _id: string; type: string; status: string; subject: string; description: string; adminNote?: string; createdAt: string; jobRef?: string; orderId?: string };

export function AppealsScreen() {
  const { data, isLoading, refetch } = useGetWorkerAppealsQuery();
  const [showNew, setShowNew] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const appeals: Appeal[] = data?.appeals ?? [];
  return (
    <View style={styles.page}>
      <ScreenHeader title="Appeals" safeArea right={<Button label="File appeal" size="small" icon={<Plus size={14} color="#fff" />} onPress={() => setShowNew(true)} />} />
      {isLoading ? <LoadingState /> : (
        <FlatList
          data={appeals}
          keyExtractor={(a) => a._id}
          contentContainerStyle={styles.body}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
          ListHeaderComponent={
            <View style={[styles.card, styles.row, { marginBottom: spacing.md }]}>
              <Scale size={22} color={zappy[600]} />
              <Text variant="caption" color={ink[700]} style={styles.flex}>Contest a rating, penalty or decision you think was unfair. A person reviews every case.</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState title="No appeals yet" message="If you feel a rating or penalty was unfair, you can file an appeal here." actionLabel="File an appeal" onAction={() => setShowNew(true)} />}
          renderItem={({ item: a }) => {
            const s = APPEAL_STATUS[a.status] ?? APPEAL_STATUS.pending;
            return (
              <View style={styles.card}>
                <View style={styles.wrap}>
                  <View style={styles.tag}><Text variant="caption" weight="bold" color={ink[700]}>{TYPE_LABELS[a.type] ?? a.type}</Text></View>
                  <View style={[styles.tag, { backgroundColor: s.bg }]}><Text variant="caption" weight="bold" color={s.fg}>{s.label}</Text></View>
                </View>
                <Text variant="body" weight="black">{a.subject}</Text>
                <Text variant="bodySmall" color={ink[500]} numberOfLines={3}>{a.description}</Text>
                {a.adminNote ? (
                  <View style={[styles.info, styles.row]}><MessagesSquare size={16} color={zappy[400]} />
                    <View style={styles.flex}><Text variant="caption" weight="bold">ADMIN RESPONSE</Text><Text variant="bodySmall">{a.adminNote}</Text></View>
                  </View>
                ) : null}
                <View style={styles.between}>
                  <Text variant="caption" color={ink[400]}>Submitted {new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  {a.jobRef || a.orderId ? <Text variant="caption" color={ink[400]}>{a.jobRef || `ID: ${a.orderId?.slice(-6)}`}</Text> : null}
                </View>
              </View>
            );
          }}
        />
      )}
      {showNew ? <NewAppealSheet onClose={() => { setShowNew(false); refetch(); }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gap: { gap: spacing.sm },
  centerCol: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  info: { backgroundColor: zappy[50], borderRadius: radius.medium, padding: spacing.md },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: slate[100], flexWrap: 'wrap' },
  dayName: { width: 86 },
  times: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.button },
  stepBtn: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepText: { minWidth: 62, textAlign: 'center' },
  dates: { gap: 6, paddingVertical: 4 },
  date: { width: 54, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingVertical: 6 },
  dateOn: { backgroundColor: ink[900], borderColor: ink[900] },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.base, paddingTop: spacing.md },
  summary: { flexDirection: 'row', gap: spacing.lg },
  bar: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: slate[100], overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: accent[500] },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: slate[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  area: { minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], textAlignVertical: 'top', backgroundColor: colors.surface },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  sheetHead: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 40, justifyContent: 'center', backgroundColor: colors.surface },
  choiceOn: { borderColor: zappy[600], backgroundColor: zappy[50] },
});
