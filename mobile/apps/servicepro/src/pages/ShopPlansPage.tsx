/**
 * Plans (the website's ShopPlansPage): monthly plans and packs at the shop's
 * own price, who subscribed, and each visit run with the customer's code and photos.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Check, Pause, Play, Plus, Repeat, Send } from 'lucide-react-native';
import {
  useProviderPlanCatalogQuery, useProviderPlanSubscriptionsQuery, useProviderPlanVisitsQuery, useProviderPlansQuery,
  useSaveProviderPlanMutation, useSetProviderPlanLiveMutation, useSubmitProviderPlanMutation,
} from '@zappy/core/api';
import { Appear, BottomSheet, Button, Chip, EmptyState, ScreenHeader, Skeleton, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { VisitCard, type Visit } from '../components/PlanVisitCard';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Opt { brandCode: string; typeName: string; totalPaise: number }
interface Svc { vertical: string; name: string; items: { repairCode: string; name: string; options: Opt[] }[] }
interface Plan { _id: string; name: string; type: string; status: string; pricePaise: number; visitsPerMonth: number; reviewNote?: string }
const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS: Record<string, string> = { draft: 'Draft', pending: 'In review', live: 'Live', paused: 'Paused', rejected: 'Not approved' };
const dayLabel = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const digits = (v: string) => v.replace(/\D/g, '');

function NewPlan({ services, onClose }: { services: Svc[]; onClose: () => void }) {
  const [save, { isLoading: saving }] = useSaveProviderPlanMutation();
  const [submit, { isLoading: sending }] = useSubmitProviderPlanMutation();
  const [vertical, setVertical] = useState(services[0]?.vertical || '');
  const service = services.find((s) => s.vertical === vertical);
  const [type, setType] = useState<'monthly' | 'pack'>('monthly');
  const [name, setName] = useState('');
  const [visits, setVisits] = useState('26');
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5, 6]);
  const [price, setPrice] = useState('');
  const [d3, setD3] = useState('8'); const [d5, setD5] = useState('12'); const [pauses, setPauses] = useState('4');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const items = Object.keys(picked).filter((k) => picked[k]).map((k) => { const [repairCode, brandCode] = k.split('|'); return { repairCode, brandCode }; });
  const pricePaise = Math.round(Number(price) * 100) || 0;
  const ok = items.length > 0 && name.trim().length >= 3 && pricePaise >= 100;
  async function go(publish: boolean) {
    try {
      const body = { vertical, name: name.trim(), type, items, pricePaise, weekdays: type === 'pack' ? [] : weekdays,
        ...(type === 'monthly' && { visitsPerMonth: Number(visits) || 1, durations: [{ months: 1, discountPct: 0 }, { months: 3, discountPct: Number(d3) || 0 }, { months: 5, discountPct: Number(d5) || 0 }], pauseDaysPerMonth: Number(pauses) || 0 }) };
      const { plan } = await save(body).unwrap();
      if (publish) { const r = await submit(plan._id).unwrap(); toast.success(r.plan.status === 'live' ? 'Your plan is live. Customers near you can subscribe now.' : 'Sent to ZappyOne for review.'); } else toast.success('Saved as a draft');
      onClose();
    } catch (err) { toast.error(errText(err, 'Could not save the plan')); }
  }
  return (
    <BottomSheet visible onClose={onClose} title="New plan" heightFraction={0.9}>
      <ScrollView contentContainerStyle={styles.sheet}>
        <View style={styles.row}>{[['monthly', 'Monthly plan'], ['pack', 'One-day pack']].map(([k, l]) => <Chip key={k} label={l} selected={type === k} onPress={() => setType(k as 'monthly' | 'pack')} />)}</View>
        <View style={styles.row}>{services.map((s) => <Chip key={s.vertical} label={s.name} selected={vertical === s.vertical} onPress={() => { setVertical(s.vertical); setPicked({}); }} />)}</View>
        <TextInput value={name} onChangeText={setName} maxLength={80} placeholder="Plan name, e.g. Daily clean 2 BHK" placeholderTextColor={ink[400]} style={styles.input} />
        <Text variant="caption" weight="bold" color={ink[500]}>{type === 'pack' ? 'JOBS IN THIS PACK' : 'DONE ON EVERY VISIT'}</Text>
        {service?.items.map((i) => (
          <View key={i.repairCode} style={styles.job}>
            <Text variant="bodySmall" weight="semibold">{i.name}</Text>
            <View style={styles.row}>{i.options.map((o) => { const k = `${i.repairCode}|${o.brandCode}`; return <Chip key={k} label={`${o.typeName} · ${rupees(o.totalPaise)}`} selected={!!picked[k]} onPress={() => setPicked({ ...picked, [k]: !picked[k] })} />; })}</View>
          </View>
        ))}
        {type === 'monthly' ? (
          <>
            <View style={styles.pair}>
              <View style={styles.flex}><Text variant="caption" color={ink[500]}>Visits a month</Text><TextInput value={visits} onChangeText={(v) => setVisits(digits(v))} keyboardType="number-pad" style={styles.input} /></View>
              <View style={styles.flex}><Text variant="caption" color={ink[500]}>Pause days a month</Text><TextInput value={pauses} onChangeText={(v) => setPauses(digits(v))} keyboardType="number-pad" style={styles.input} /></View>
            </View>
            <View style={styles.row}>{DAYS.map((d, i) => <Chip key={d} label={d} selected={weekdays.includes(i)} onPress={() => setWeekdays(weekdays.includes(i) ? weekdays.filter((x) => x !== i) : [...weekdays, i].sort())} />)}</View>
            <View style={styles.pair}>
              <View style={styles.flex}><Text variant="caption" color={ink[500]}>Off for 3 months (%)</Text><TextInput value={d3} onChangeText={(v) => setD3(digits(v))} keyboardType="number-pad" style={styles.input} /></View>
              <View style={styles.flex}><Text variant="caption" color={ink[500]}>Off for 5 months (%)</Text><TextInput value={d5} onChangeText={(v) => setD5(digits(v))} keyboardType="number-pad" style={styles.input} /></View>
            </View>
          </>
        ) : null}
        <Text variant="caption" color={ink[500]}>{type === 'pack' ? 'Pack price (₹)' : 'Price a month (₹)'}</Text>
        <TextInput value={price} onChangeText={(v) => setPrice(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" style={styles.input} />
        <View style={styles.pair}>
          <Button label="Save draft" variant="outline" onPress={() => go(false)} disabled={!ok || saving || sending} style={styles.flex} />
          <Button label="Publish" icon={<Send size={15} color="#fff" />} onPress={() => go(true)} loading={sending} disabled={!ok || saving} style={styles.flex} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export function ShopPlansPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'visits' | 'plans' | 'customers'>('visits');
  const [creating, setCreating] = useState(false);
  const { data: catalog } = useProviderPlanCatalogQuery(undefined);
  const { data: plans, isLoading } = useProviderPlansQuery(undefined);
  const { data: subs } = useProviderPlanSubscriptionsQuery(undefined, { skip: tab !== 'customers' });
  const { data: visits } = useProviderPlanVisitsQuery({ days: 7 }, { skip: tab !== 'visits', pollingInterval: 60000 });
  const [setLive] = useSetProviderPlanLiveMutation();
  const [submit] = useSubmitProviderPlanMutation();
  const services: Svc[] = catalog?.services || [];
  const active = useMemo(() => (subs?.items || []).filter((s: { status: string }) => s.status === 'active'), [subs]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/shop' as never));
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title="Plans" subtitle="Monthly plans and packs at your price" onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Button label="New plan" icon={<Plus size={16} color="#fff" />} onPress={() => setCreating(true)} disabled={!services.length} fullWidth />
        {!services.length ? <Text variant="caption" color={ink[500]}>Price at least one job in Work & prices first. Plans are built from the jobs you have priced.</Text> : null}
        <View style={styles.row}>{[['visits', 'Visits', CalendarDays], ['plans', 'My plans', Repeat], ['customers', 'Customers', Check]].map(([k, l]) => <Chip key={k as string} label={l as string} selected={tab === k} onPress={() => setTab(k as 'visits')} />)}</View>
        {tab === 'visits' ? (
          (visits?.items || []).length ? (visits.items as Visit[]).map((v, i) => <Appear key={v._id} delay={Math.min(i, 8) * 40}><VisitCard v={v} /></Appear>)
            : visits ? <EmptyState icon={<CalendarDays size={28} color={slate[300]} />} title="No plan visits this week" message="When customers subscribe to your plans, their visits show here." /> : <Skeleton height={90} />
        ) : null}
        {tab === 'plans' ? (
          <>
            {isLoading ? <Skeleton height={80} /> : null}
            {(plans?.items || []).map((p: Plan, i: number) => (
              <Appear key={p._id} delay={Math.min(i, 8) * 40} style={styles.card}>
                <View style={styles.between}>
                  <View style={styles.flex}><Text variant="bodySmall" weight="bold">{p.name}</Text><Text variant="caption" color={ink[500]}>{p.type === 'pack' ? 'One-day pack' : `${p.visitsPerMonth} visits a month`} · {rupees(p.pricePaise)}</Text></View>
                  <Text variant="caption" weight="bold" color={p.status === 'live' ? success[600] : ink[500]}>{STATUS[p.status]}</Text>
                </View>
                {p.reviewNote ? <Text variant="caption" color={ink[500]}>{p.reviewNote}</Text> : null}
                <View style={styles.row}>
                  {p.status === 'live' ? <Button label="Pause" size="small" variant="outline" icon={<Pause size={13} color={ink[700]} />} onPress={() => setLive({ id: p._id, live: false })} /> : null}
                  {p.status === 'paused' ? <Button label="Resume" size="small" variant="outline" icon={<Play size={13} color={ink[700]} />} onPress={() => setLive({ id: p._id, live: true })} /> : null}
                  {['draft', 'rejected'].includes(p.status) ? <Button label="Publish" size="small" variant="outline" onPress={async () => { try { const r = await submit(p._id).unwrap(); toast.success(r.plan.status === 'live' ? 'Live now' : 'Sent for review'); } catch (err) { toast.error(errText(err, 'Could not publish')); } }} /> : null}
                </View>
              </Appear>
            ))}
            {plans && !plans.items.length ? <EmptyState icon={<Repeat size={28} color={slate[300]} />} title="No plans yet" message="Customers love a fixed monthly price. Create your first plan." /> : null}
          </>
        ) : null}
        {tab === 'customers' ? (
          <>
            <Text variant="caption" weight="semibold" color={ink[500]}>{active.length} active {active.length === 1 ? 'customer' : 'customers'}</Text>
            {(subs?.items || []).map((s: { _id: string; status: string; snapshot: { name: string }; address: { text: string }; timeSlot: string; monthlyPaise: number }) => (
              <View key={s._id} style={[styles.card, styles.between]}>
                <View style={styles.flex}><Text variant="bodySmall" weight="bold">{s.snapshot.name}</Text><Text variant="caption" color={ink[500]} numberOfLines={1}>{s.address.text} · {s.timeSlot}</Text></View>
                <View><Text variant="bodySmall" weight="bold">{rupees(s.monthlyPaise)}</Text><Text variant="caption" color={ink[500]}>{s.status}</Text></View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
      {creating ? <NewPlan services={services} onClose={() => setCreating(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  sheet: { gap: spacing.md, padding: spacing.base, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  flex: { flex: 1, minWidth: 0 },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  job: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  code: { flex: 1, textAlign: 'center', fontSize: 20, letterSpacing: 8 },
});
