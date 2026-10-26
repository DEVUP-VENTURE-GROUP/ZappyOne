/** What the shop earned today, this week or this month, across all its technicians (the website's ShopEarningsPage). */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Briefcase, Users } from 'lucide-react-native';
import { useShopEarningsQuery } from '@zappy/core/api';
import { LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { inr } from '@zappy/ui/components/worker/DashboardUI';
import { colors, ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { StatementButton } from '../components/StatementButton';

const RANGES = [{ key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }];

export function ShopEarningsPage() {
  const [range, setRange] = useState('today');
  const { data, isLoading } = useShopEarningsQuery(range);
  return (
    <View style={styles.page}>
      <ScreenHeader title="Earnings" safeArea />
      <ScrollView contentContainerStyle={styles.body}>
        <StatementButton />
        <View style={styles.row}>
          {RANGES.map((r) => (
            <Pressable key={r.key} onPress={() => setRange(r.key)} accessibilityRole="tab" accessibilityState={{ selected: range === r.key }} style={[styles.range, range === r.key && styles.rangeOn]}>
              <Text variant="caption" weight="bold" color={range === r.key ? '#fff' : ink[500]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
        {isLoading ? <LoadingState /> : (
          <>
            <View style={styles.total}>
              <Text variant="caption" weight="semibold" color={zappy[100]}>TOTAL EARNINGS</Text>
              <Text variant="display" weight="black" color="#fff">{inr(data?.earningsRupees ?? 0)}</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.stat}>
                <View style={[styles.icon, { backgroundColor: success[50] }]}><Briefcase size={16} color={success[600]} /></View>
                <Text variant="heading2" weight="black">{data?.jobs ?? 0}</Text>
                <Text variant="caption" weight="semibold" color={ink[400]}>Jobs completed</Text>
              </View>
              <View style={styles.stat}>
                <View style={[styles.icon, { backgroundColor: zappy[50] }]}><Users size={16} color={zappy[600]} /></View>
                <Text variant="heading2" weight="black">{data?.workerCount ?? 0}</Text>
                <Text variant="caption" weight="semibold" color={ink[400]}>Technicians in your shop</Text>
              </View>
            </View>
            <Text variant="caption" color={ink[400]} style={styles.center}>Earnings across all technicians linked to your shop.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  row: { flexDirection: 'row', gap: spacing.sm },
  range: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  rangeOn: { backgroundColor: zappy[600], borderColor: zappy[600] },
  total: { gap: 4, padding: spacing.lg, borderRadius: radius.large, backgroundColor: zappy[600] },
  stat: { flex: 1, gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  icon: { width: 36, height: 36, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
