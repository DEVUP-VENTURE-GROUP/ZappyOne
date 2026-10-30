/**
 * Monthly plans and packs near the customer (the website's PlansNear), with
 * the subscribe sheet: duration, start day, time, and the full price.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarCheck, Repeat, Star } from 'lucide-react-native';
import { usePlanQuoteQuery, usePlansNearAnyQuery, usePlansNearQuery, useSubscribePlanMutation } from '@zappy/core/api';
import { Appear, BottomSheet, Button, Chip, Skeleton, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { RIPPLE, errText } from '@zappy/ui/lib/feedback';
import { colors, ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Plan { _id: string; name: string; type: 'monthly' | 'pack'; visitsPerMonth: number; pricePaise: number; perVisitPaise: number; savingsPct: number | null; pauseDaysPerMonth: number; durations: { months: number; discountPct: number }[]; provider: { id: string; name: string; rating: number | null } }
const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const istDay = (plus = 0) => new Date(Date.now() + 330 * 60000 + plus * 86400000).toISOString().slice(0, 10);
const SLOTS = ['07:00', '08:00', '09:00', '10:00', '11:00', '14:00', '16:00', '18:00'];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

type Where = { lat: number; lng: number; address?: string; label?: string };

function Subscribe({ plan, loc, onClose }: { plan: Plan; loc: Where; onClose: () => void }) {
  const router = useRouter();
  const [months, setMonths] = useState(1);
  const [startIn, setStartIn] = useState(1);
  const [slot, setSlot] = useState('08:00');
  const key = useMemo(() => `plan-${plan._id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, [plan._id]);
  const { data: q, isFetching } = usePlanQuoteQuery({ id: plan._id, months });
  const [subscribe, { isLoading }] = useSubscribePlanMutation();
  const address = (loc as { address?: string; label?: string }).address || (loc as { label?: string }).label || '';
  async function go() {
    try {
      const r = await subscribe({ planId: plan._id, months, startDay: istDay(startIn), timeSlot: slot, address: { text: address, lat: loc.lat, lng: loc.lng }, idempotencyKey: key }).unwrap();
      toast.success(`Subscribed. ${r.visits} visits are booked.`);
      onClose();
      router.push('/my-plans' as never);
    } catch (err) { toast.error(errText(err, 'Could not subscribe. Try again.')); }
  }
  return (
    <BottomSheet visible onClose={onClose} title={plan.name}>
      <View style={styles.sheet}>
        <Text variant="caption" color={ink[500]}>{plan.provider.name}</Text>
        {plan.type === 'monthly' ? (
          <View style={styles.row}>{plan.durations.map((d) => <Chip key={d.months} label={`${d.months} mo${d.discountPct ? ` · ${d.discountPct}% off` : ''}`} selected={months === d.months} onPress={() => setMonths(d.months)} />)}</View>
        ) : null}
        <Text variant="caption" weight="semibold" color={ink[700]}>Start</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {DAYS.map((n) => <Chip key={n} label={new Date(`${istDay(n)}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })} selected={startIn === n} onPress={() => setStartIn(n)} />)}
        </ScrollView>
        <Text variant="caption" weight="semibold" color={ink[700]}>Time</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{SLOTS.map((s) => <Chip key={s} label={s} selected={slot === s} onPress={() => setSlot(s)} />)}</ScrollView>
        <View style={styles.bill}>
          {isFetching || !q ? <Skeleton height={48} /> : (
            <>
              <View style={styles.line}><Text variant="bodySmall" color={ink[700]}>{plan.type === 'pack' ? 'Pack' : 'Plan, a month'}</Text><Text variant="bodySmall" weight="semibold">{rupees(q.monthlyPaise)}</Text></View>
              <View style={styles.line}><Text variant="bodySmall" color={ink[700]}>Platform fee</Text><Text variant="bodySmall" weight="semibold">{rupees(q.platformFeePaise)}</Text></View>
              <View style={[styles.line, styles.total]}><Text variant="bodySmall" weight="bold">Total{months > 1 ? ` for ${months} months` : ''}</Text><Text variant="bodySmall" weight="bold">{rupees(q.totalPaise)}</Text></View>
            </>
          )}
        </View>
        <Text variant="caption" color={ink[500]}>Pay {plan.provider.name} in cash or UPI at the first visit of each month. Each visit starts only with the code in your app. A missed visit is made up for free{plan.pauseDaysPerMonth ? `, and you can pause ${plan.pauseDaysPerMonth} days a month` : ''}.</Text>
        <Button label="Subscribe" icon={<CalendarCheck size={16} color="#fff" />} onPress={go} loading={isLoading} disabled={!q || !address} fullWidth size="large" />
      </View>
    </BottomSheet>
  );
}

export function PlansNear({ vertical, loc, providerId = null, title = 'Monthly plans near you' }: { vertical?: string; loc: Where | null; providerId?: string | null; title?: string }) {
  // Without a service (the home) it shows plans near the customer across every service.
  const one = usePlansNearQuery({ vertical, lat: loc?.lat, lng: loc?.lng }, { skip: !loc || !vertical });
  const any = usePlansNearAnyQuery({ lat: loc?.lat, lng: loc?.lng }, { skip: !loc || !!vertical });
  const data = vertical ? one.data : any.data;
  const [open, setOpen] = useState<Plan | null>(null);
  const plans: Plan[] = (data?.items || []).filter((p: Plan) => !providerId || p.provider.id === providerId);
  if (!plans.length || !loc) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}><Repeat size={16} color={zappy[600]} /><Text variant="sectionHeading" weight="bold">{title}</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {plans.map((p, i) => (
          <Appear key={p._id} delay={Math.min(i, 6) * 50}>
            <Pressable onPress={() => setOpen(p)} android_ripple={RIPPLE} accessibilityRole="button" accessibilityLabel={p.name} style={styles.card}>
              <Text variant="caption" weight="bold" color={zappy[700]}>{p.type === 'pack' ? 'ONE-DAY PACK' : `${p.visitsPerMonth} VISITS A MONTH`}</Text>
              <Text variant="bodySmall" weight="bold" numberOfLines={2}>{p.name}</Text>
              <View style={styles.inline}><Text variant="caption" color={ink[500]}>{p.provider.name}</Text>{p.provider.rating != null ? <><Star size={10} color="#F59E0B" fill="#F59E0B" /><Text variant="caption" color={ink[500]}>{p.provider.rating.toFixed(1)}</Text></> : null}</View>
              <View style={styles.price}><Text variant="bodyLarge" weight="bold">{rupees(p.pricePaise)}</Text>{p.type === 'monthly' ? <Text variant="caption" color={ink[500]}>/month · {rupees(p.perVisitPaise)} a visit</Text> : null}</View>
              {p.savingsPct ? <Text variant="caption" weight="bold" color={success[600]}>{p.savingsPct}% less than booking each visit</Text> : null}
            </Pressable>
          </Appear>
        ))}
      </ScrollView>
      {open ? <Subscribe plan={open} loc={loc} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rail: { gap: spacing.md, paddingRight: spacing.base },
  card: { width: 240, gap: 4, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  price: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  sheet: { gap: spacing.md, padding: spacing.base },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bill: { gap: 4, padding: spacing.md, borderRadius: radius.large, backgroundColor: colors.background },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  total: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4 },
});
