import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarClock, ClipboardList, Repeat, Wrench } from 'lucide-react-native';
import { useProviderPlanVisitsQuery } from '@zappy/core/api';
import { useProviderJobs } from '@zappy/core/shared/useProviderJobs';
import { hourBook, timeOf, todaysTimeline, workshopColumns } from '@zappy/core/shared/tradeToday';
import { Text } from '@zappy/ui/components';
import { providerPath } from '@zappy/ui/provider/paths';
import { accent, colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Line { id: string; at: string; title: string; sub?: string; status: string; attention: boolean; to?: string; past?: boolean }
interface Job { kind: string; id: string; title: string; status: string; to?: string; attention?: boolean; workerId?: string | null; at?: string; subtitle?: string }
const TITLE = { workshop: ['Repairs right now', Wrench], visits: ["Today's visits", CalendarClock], appointments: ["Today's appointments", CalendarClock], tasks: ["Today's tasks", ClipboardList] } as const;

// The top of a trade's home (the website's TradeToday): its day in the shape that trade works.
export function TradeToday({ home = 'workshop', kinds }: { home?: string; kinds: string[] }) {
  const router = useRouter();
  const { mine } = useProviderJobs({ kinds });
  const jobs = (mine || []) as Job[];
  const { data: visitData } = useProviderPlanVisitsQuery({ days: 1 }, { skip: home !== 'visits' && home !== 'appointments', pollingInterval: 60000 });
  const [title, Icon] = TITLE[home as keyof typeof TITLE] || TITLE.workshop;
  const open = (to?: string) => { if (to) router.push(providerPath(to) as never); };

  const row = (r: Line) => (
    <Pressable key={r.id} onPress={() => open(r.to)} accessibilityRole="button" style={[styles.row, r.past ? styles.past : null]}>
      <Text variant="caption" weight="bold" color={ink[500]} style={styles.time}>{r.at ? timeOf(r.at) : ''}</Text>
      <View style={styles.flex}>
        <View style={styles.inline}>{r.id.startsWith('plan-') ? <Repeat size={12} color={zappy[600]} /> : null}<Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.cap}>{r.title}</Text></View>
        {r.sub ? <Text variant="caption" color={ink[500]} numberOfLines={1}>{r.sub}</Text> : null}
      </View>
      <Text variant="caption" weight="semibold" color={r.attention ? accent[700] : ink[500]}>{r.status}</Text>
    </Pressable>
  );

  let body: React.ReactNode;
  if (home === 'workshop') {
    body = workshopColumns(jobs).map((c: { key: string; label: string; items: Job[] }) => (
      <View key={c.key} style={styles.col}>
        <View style={styles.between}>
          <Text variant="caption" weight="black" color={ink[500]}>{c.label.toUpperCase()}</Text>
          <Text variant="caption" weight="black" color={c.key === 'you' && c.items.length ? accent[700] : ink[500]}>{c.items.length}</Text>
        </View>
        {c.items.slice(0, 3).map((j) => (
          <Pressable key={`${j.kind}-${j.id}`} onPress={() => open(j.to)} accessibilityRole="button" style={styles.card}>
            <Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.cap}>{j.title}</Text>
            <Text variant="caption" color={ink[500]} numberOfLines={1}>{j.status}</Text>
          </Pressable>
        ))}
        {!c.items.length ? <Text variant="caption" color={ink[400]}>Nothing here</Text> : null}
      </View>
    ));
  } else {
    const rows = todaysTimeline(jobs, visitData?.items || []) as Line[];
    if (!rows.length) body = <Text variant="bodySmall" color={ink[500]} style={styles.empty}>Nothing booked for today yet. New bookings appear here as they come in.</Text>;
    else if (home === 'appointments') {
      body = (hourBook(rows) as { hour: number; label: string; items: Line[] }[]).filter((h, i, all) => h.items.length || (i > 0 && all[i - 1].items.length)).map((h) => (
        <View key={h.hour} style={styles.hour}>
          <Text variant="caption" weight="bold" color={ink[400]} style={styles.hourLabel}>{h.label}</Text>
          <View style={styles.flex}>{h.items.length ? h.items.map(row) : <Text variant="caption" color={success[700]} style={styles.free}>Free</Text>}</View>
        </View>
      ));
    } else body = rows.map(row);
  }

  return (
    <View style={styles.panel}>
      <View style={styles.inline}><Icon size={16} color={zappy[600]} /><Text variant="body" weight="black">{title}</Text></View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { gap: 6, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: slate[50] },
  card: { gap: 2, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: slate[100] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  past: { opacity: 0.6 },
  time: { width: 64 },
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  hour: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: 1, borderTopColor: slate[100], paddingTop: 4 },
  hourLabel: { width: 44, paddingTop: 12 },
  free: { paddingVertical: 10 },
  empty: { textAlign: 'center', paddingVertical: spacing.lg },
});
