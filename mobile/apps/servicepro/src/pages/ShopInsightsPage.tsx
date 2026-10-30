// The website's ShopInsightsPage.
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Crown } from 'lucide-react-native';
import { usePartnerInsightsQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Chip, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { accent, colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const RANGES = [7, 30, 90];
interface Day { date: string; jobs: number; valuePaise: number }
interface Member { id: string; name: string; role: string; rating: number | null; jobs: number; valuePaise: number }

export function ShopInsightsPage() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const { data, isLoading } = usePartnerInsightsQuery(days);
  const list: Day[] = data?.days || [];
  const peak = Math.max(1, ...list.map((d) => d.jobs));

  return (
    <View style={styles.page}>
      <ScreenHeader title="Insights" safeArea onBack={() => router.back()} />
      <View style={styles.chips}>{RANGES.map((r) => <Chip key={r} label={`${r} days`} selected={days === r} onPress={() => setDays(r)} />)}</View>
      {isLoading || !data ? <LoadingState /> : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.tiles}>
            {([
              ['Jobs done', String(data.totals.jobs)],
              ['Value of jobs', formatPaise(data.totals.valuePaise)],
              ['Open now', String(data.open)],
              ['Team', `${data.totals.team}${data.totals.leads ? `, ${data.totals.leads} lead${data.totals.leads === 1 ? '' : 's'}` : ''}`],
            ] as [string, string][]).map(([label, value]) => (
              <View key={label} style={styles.tile}>
                <Text variant="caption" weight="semibold" color={ink[500]}>{label}</Text>
                <Text variant="heading3" weight="black">{value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text variant="bodySmall" weight="black">Jobs done each day</Text>
            <View style={styles.chart}>
              {list.map((d) => <View key={d.date} style={[styles.bar, { height: `${(d.jobs / peak) * 100}%`, minHeight: d.jobs ? 3 : 1 }]} />)}
            </View>
            <View style={styles.axis}>
              <Text variant="caption" color={ink[400]}>{list[0]?.date}</Text>
              <Text variant="caption" color={ink[400]}>Most in a day: {peak}</Text>
              <Text variant="caption" color={ink[400]}>{list[list.length - 1]?.date}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text variant="bodySmall" weight="black">By member</Text>
            {!data.members.length ? <Text variant="caption" color={ink[400]}>Add people to your team to see how each is doing.</Text> : null}
            {(data.members as Member[]).map((m) => (
              <View key={m.id} style={styles.member}>
                <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.flex}>{m.name}</Text>
                {m.role === 'lead' ? <Crown size={11} color={accent[600]} /> : null}
                <Text variant="caption" color={ink[700]}>{m.jobs} job{m.jobs === 1 ? '' : 's'}</Text>
                <Text variant="caption" color={ink[700]}>{formatPaise(m.valuePaise)}</Text>
                <Text variant="caption" color={ink[500]}>{m.rating ? `${Number(m.rating).toFixed(1)}★` : '—'}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  chips: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  body: { padding: spacing.base, paddingBottom: 120, gap: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexBasis: '47%', flexGrow: 1, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: zappy[500] },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  flex: { flex: 1, minWidth: 0 },
});
