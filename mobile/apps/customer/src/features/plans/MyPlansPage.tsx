/**
 * The customer's plans (the website's MyPlansPage): today's start code, the
 * coming visits, pausing a day, rating visits and cancelling.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarX2, KeyRound, Pause, Repeat, Star } from 'lucide-react-native';
import { useCancelPlanMutation, useMyPlansQuery, usePausePlanDayMutation, useRatePlanVisitMutation } from '@zappy/core/api';
import { Appear, Button, EmptyState, ScreenHeader, Skeleton, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, danger, ink, slate, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Visit { _id: string; day: string; status: string; startCode: string; makeupFor: string | null; rating?: { stars?: number } }
interface Sub { _id: string; status: string; timeSlot: string; endDay: string; monthlyPaise: number; platformFeePaise: number; snapshot: { name: string }; visits: Visit[] }
const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const dayLabel = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function VisitRow({ v, subId, canPause }: { v: Visit; subId: string; canPause: boolean }) {
  const [pause] = usePausePlanDayMutation();
  const [rate] = useRatePlanVisitMutation();
  const isToday = v.day === today();
  return (
    <View style={styles.visit}>
      <Text variant="bodySmall" weight="semibold" style={styles.day}>{isToday ? 'Today' : dayLabel(v.day)}</Text>
      <Text variant="caption" weight="bold" color={v.status === 'done' ? success[600] : v.status === 'missed' ? danger[600] : ink[500]}>{v.makeupFor ? 'makeup' : v.status}</Text>
      <View style={styles.end}>
        {v.status === 'scheduled' && isToday ? <View style={styles.code}><KeyRound size={12} color="#fff" /><Text variant="bodySmall" weight="bold" color="#fff">{v.startCode}</Text></View> : null}
        {v.status === 'scheduled' && v.day > today() && canPause && !v.makeupFor ? (
          <Pressable accessibilityRole="button" onPress={async () => { try { const r = await pause({ id: subId, day: v.day }).unwrap(); toast.success(`Paused. A makeup visit is added. ${r.pausesLeft} pauses left this month.`); } catch (err) { toast.error(errText(err, 'Could not pause')); } }} style={styles.inline}>
            <Pause size={12} color={ink[500]} /><Text variant="caption" weight="bold" color={ink[500]}>Pause</Text>
          </Pressable>
        ) : null}
        {v.status === 'done' && !v.rating?.stars ? (
          <View style={styles.inline}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} accessibilityLabel={`${n} stars`} onPress={() => rate({ id: v._id, stars: n }).unwrap().then(() => toast.success('Thanks for rating')).catch(() => toast.error('Could not save'))}><Star size={18} color="#F59E0B" /></Pressable>)}</View>
        ) : null}
        {v.rating?.stars ? <View style={styles.inline}><Star size={12} color="#F59E0B" fill="#F59E0B" /><Text variant="caption" weight="bold">{v.rating.stars}</Text></View> : null}
      </View>
    </View>
  );
}

export function MyPlansPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useMyPlansQuery(undefined, { pollingInterval: 60000 });
  const [cancel, { isLoading: cancelling }] = useCancelPlanMutation();
  const [confirming, setConfirming] = useState<string | null>(null);
  const items: Sub[] = data?.items || [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title="My plans" subtitle="Subscriptions" onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        {isLoading ? [0, 1].map((k) => <Skeleton key={k} height={120} />) : null}
        {!isLoading && !items.length ? <EmptyState icon={<Repeat size={28} color={slate[300]} />} title="No plans yet" message="Open a service and pick a monthly plan from a provider near you." /> : null}
        {items.map((s, i) => (
          <Appear key={s._id} delay={i * 50} style={styles.card}>
            <View style={styles.between}>
              <View style={styles.flex}><Text variant="bodySmall" weight="bold">{s.snapshot.name}</Text><Text variant="caption" color={ink[500]}>{s.timeSlot} · until {dayLabel(s.endDay)} · {rupees(s.monthlyPaise + s.platformFeePaise)} a month</Text></View>
              <Text variant="caption" weight="bold" color={ink[700]}>{s.status}</Text>
            </View>
            {s.visits.map((v) => <VisitRow key={v._id} v={v} subId={s._id} canPause={s.status === 'active'} />)}
            {s.status === 'active' ? (confirming === s._id ? (
              <View style={styles.confirm}>
                <Text variant="caption" color={danger[600]} style={styles.flex}>Cancel? Visits already paid for this month stay booked.</Text>
                <Button label="Yes, cancel" variant="danger" size="small" loading={cancelling} onPress={() => cancel({ id: s._id, reason: '' }).unwrap().then(() => { toast.success('Plan cancelled'); setConfirming(null); }).catch((err: unknown) => toast.error(errText(err, 'Could not cancel')))} />
                <Button label="Keep" variant="ghost" size="small" onPress={() => setConfirming(null)} />
              </View>
            ) : <Pressable accessibilityRole="button" onPress={() => setConfirming(s._id)} style={styles.inline}><CalendarX2 size={13} color={ink[500]} /><Text variant="caption" weight="bold" color={ink[500]}>Cancel plan</Text></Pressable>) : null}
          </Appear>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  visit: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  day: { width: 96 },
  end: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  code: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: ink[900] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: '#FEF2F2' },
});
