/**
 * A visit with several vehicles or devices (the website's RepairGroupPage):
 * where each one stands, and the way into its own page (tracking, quote,
 * report, warranty).
 */
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { useRepairGroupQuery } from '@zappy/core/api';
import { KINDS } from '@zappy/core/shared/jobKinds';
import { formatPaise } from '@zappy/core/shared/money';
import { STAGE_LABEL } from '@zappy/core/shared/repairBasket';
import { EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Booking = any;
const deviceName = (b: Booking) => [b.brandCode, b.modelCode].filter(Boolean).join(' ').replace(/-/g, ' ');

export function RepairGroupPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isFetching } = useRepairGroupQuery(id, { skip: !id, pollingInterval: 30000 });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/orders' as never));
  const header = <ScreenHeader title="Your visit" onBack={back} />;
  if (isLoading) return <View style={[styles.page, { paddingTop: insets.top }]}>{header}<LoadingState /></View>;
  if (!data?.group) return <View style={[styles.page, { paddingTop: insets.top }]}>{header}<EmptyState title="This visit could not be found." /></View>;
  const { group, bookings } = data as { group: Booking; bookings: Booking[] };
  const done = bookings.filter((b) => KINDS.repair.stageOf(b.status) === 'completed').length;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {header}
      <FlatList data={bookings} keyExtractor={(b) => b._id} onRefresh={refetch} refreshing={isFetching && !isLoading}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        ListHeaderComponent={(
          <View style={styles.card}>
            <Text variant="caption" weight="bold" color={ink[500]}>ONE VISIT · {group.reference}</Text>
            <Text variant="heading3" weight="black">{bookings.length} items · {done} done</Text>
            <Text variant="caption" color={ink[500]}>{group.location?.address}</Text>
            <Text variant="bodySmall" weight="bold">{formatPaise(group.totals?.totalPaise)} total</Text>
          </View>
        )}
        renderItem={({ item: b }) => {
          const stage = KINDS.repair.stageOf(b.status) || 'in_progress';
          return (
            <Pressable onPress={() => router.push(`/repair/bookings/${b._id}` as never)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.card, styles.row]}>
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.cap}>{b.itemLabel || deviceName(b)}</Text>
                <Text variant="caption" color={ink[500]}>{(STAGE_LABEL as Record<string, string>)[stage] || 'In progress'}</Text>
              </View>
              <ChevronRight size={16} color={slate[300]} />
            </Pressable>
          );
        }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  list: { gap: spacing.md, padding: spacing.base },
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  cap: { textTransform: 'capitalize' },
});
