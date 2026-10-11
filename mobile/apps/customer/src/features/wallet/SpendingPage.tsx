/** Spending analytics (the website's SpendingPage): totals, the last six months, and the services spent on most. */
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, ShoppingBag, Tag, TrendingUp } from 'lucide-react-native';
import { useGetSpendingQuery } from '@zappy/core/api';
import { serviceLabel } from '@zappy/core/shared/services';
import { EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { ShareBar } from '@zappy/ui/components/common/ShareBar';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, danger, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const rs = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function SpendingPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useGetSpendingQuery(undefined);
  const months: { month: string; totalRupees: number }[] = (data?.monthly ?? []).slice(-6);
  const top: { service: string; totalRupees: number }[] = data?.topServices ?? [];
  const maxMonth = Math.max(1, ...months.map((m) => m.totalRupees));
  const maxService = Math.max(1, ...top.map((s) => s.totalRupees));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  const stats: [React.ReactNode, string, string][] = [
    [<ShoppingBag key="s" size={20} color={zappy[500]} />, rs(data?.totalSpentRupees ?? 0), t('spending.total', 'Total spent')],
    [<Package key="o" size={20} color={success[500]} />, String(data?.orderCount ?? 0), t('spending.orders', 'Orders')],
    [<Tag key="t" size={20} color={danger[500]} />, rs((data?.totalSavingsPaise ?? 0) / 100), t('spending.saved', 'Saved')],
  ];

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('spending.title', 'Spending Analytics')} onBack={back} />
      {isLoading ? <LoadingState /> : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.stats}>
            {stats.map(([icon, value, label]) => (
              <View key={label} style={[styles.card, styles.stat]}>{icon}<Text variant="body" weight="bold">{value}</Text><Text variant="caption" color={ink[500]}>{label}</Text></View>
            ))}
          </View>
          {months.length ? (
            <View style={styles.card}>
              <View style={styles.head}><TrendingUp size={16} color={zappy[500]} /><Text variant="bodySmall" weight="semibold">{t('spending.monthly', 'Monthly Spending (last 6 months)')}</Text></View>
              {months.map((m) => (
                <View key={m.month} style={styles.item}>
                  <View style={styles.line}><Text variant="caption" color={ink[500]}>{new Date(`${m.month}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}</Text><Text variant="caption" weight="medium" color={ink[700]}>{rs(m.totalRupees)}</Text></View>
                  <ShareBar value={m.totalRupees} max={maxMonth} />
                </View>
              ))}
            </View>
          ) : null}
          {top.length ? (
            <View style={styles.card}>
              <Text variant="bodySmall" weight="semibold">{t('spending.top', 'Top Services')}</Text>
              {top.map((s, i) => (
                <View key={s.service} style={styles.item}>
                  <View style={styles.line}><Text variant="caption" color={ink[500]}><Text variant="caption" color={slate[300]}>#{i + 1} </Text>{serviceLabel(s.service)}</Text><Text variant="caption" weight="medium" color={ink[700]}>{rs(s.totalRupees)}</Text></View>
                  <ShareBar value={s.totalRupees} max={maxService} color={success[500]} />
                </View>
              ))}
            </View>
          ) : null}
          {!months.length && !top.length ? <EmptyState icon={<ShoppingBag size={36} color={slate[300]} />} title={t('spending.none', 'No spending data yet')} message={t('spending.noneHint', 'Complete your first order to see analytics')} /> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.base, padding: spacing.base },
  stats: { flexDirection: 'row', gap: spacing.md },
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  item: { gap: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
});
