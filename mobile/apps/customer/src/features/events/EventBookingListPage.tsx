/** My event bookings (the website's EventBookingListPage), newest first, a page at a time. */
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package } from 'lucide-react-native';
import { useGetEventBookingsQuery } from '@zappy/core/api';
import { Button, EmptyState, ErrorState, ScreenHeader, Skeleton } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { EventBookingRow, type EventBookingSummary } from './EventBookingRow';

export function EventBookingListPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = useGetEventBookingsQuery(page);
  const bookings: EventBookingSummary[] = data?.bookings || [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/events' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('events.myBookings', 'My event bookings')} onBack={back} />
      {isError ? <ErrorState onRetry={refetch} /> : (
        <FlatList data={isLoading ? [] : bookings} keyExtractor={(b) => b._id} onRefresh={refetch} refreshing={isFetching && !isLoading}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          renderItem={({ item }) => <EventBookingRow booking={item} onPress={() => router.push(`/events/bookings/${item._id}` as never)} />}
          ListEmptyComponent={isLoading ? <>{[0, 1, 2].map((i) => <Skeleton key={i} height={88} borderRadius={radius.large} />)}</>
            : <EmptyState icon={<Package size={44} color={slate[300]} />} title={t('events.noBookings', 'No event bookings yet')} message={t('events.noBookingsHint', 'Browse themes and book your first event.')} actionLabel={t('events.explore', 'Explore events')} onAction={() => router.push('/events' as never)} />}
          ListFooterComponent={(data?.pages || 0) > 1 ? (
            <View style={styles.pager}>
              <Button label={t('common.newer', 'Newer')} variant="outline" size="small" disabled={page <= 1} onPress={() => setPage(page - 1)} />
              <Button label={t('common.older', 'Older')} variant="outline" size="small" disabled={page >= data.pages} onPress={() => setPage(page + 1)} />
            </View>
          ) : null} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  list: { gap: spacing.md, padding: spacing.base },
  pager: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
});
