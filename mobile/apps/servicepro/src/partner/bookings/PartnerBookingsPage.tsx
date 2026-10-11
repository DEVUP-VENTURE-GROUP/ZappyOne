/** Every booking, filtered by what the partner needs to do with it (the events website's BookingsPage). */
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CalendarCheck } from 'lucide-react-native';
import { usePartnerBookingsQuery } from '@zappy/core/api';
import { FILTERS } from '@zappy/core/shared/partnerBookings';
import { Button, Chip, EmptyState, ErrorState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { colors, ink, slate } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { PartnerBookingRow, type PartnerBooking } from '../PartnerBookingRow';
import { usePartner } from '../usePartner';
import { VerifyFirst } from '../VerifyFirst';

export function PartnerBookingsPage() {
  const params = useLocalSearchParams<{ status?: string }>();
  const { partner, verified } = usePartner();
  const [status, setStatus] = useState(params.status ?? 'confirmed');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = usePartnerBookingsQuery({ status: status || undefined, page }, { skip: !verified });
  const rows: PartnerBooking[] = data?.bookings || [];
  const pick = (k: string) => { setStatus(k); setPage(1); };

  return (
    <View style={styles.page}>
      <ScreenHeader title="Bookings" subtitle="Accept new requests, then set up on the day." safeArea />
      {!verified ? <VerifyFirst kycStatus={partner?.kyc?.status} /> : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsWrap} contentContainerStyle={styles.tabs}>
            {FILTERS.map((f: { key: string; label: string }) => <Chip key={f.key || 'all'} label={f.label} selected={status === f.key} onPress={() => pick(f.key)} />)}
          </ScrollView>
          {isError ? <ErrorState onRetry={refetch} /> : isLoading ? <LoadingState /> : (
            <FlatList data={rows} keyExtractor={(b) => b._id} contentContainerStyle={styles.list} onRefresh={refetch} refreshing={isFetching}
              renderItem={({ item }) => <PartnerBookingRow booking={item} />}
              ListEmptyComponent={<EmptyState icon={<CalendarCheck size={40} color={slate[300]} />} title="No bookings here"
                message={status === 'confirmed' ? 'New requests appear here as soon as a customer books one of your packages.' : 'Nothing in this list yet.'} />}
              ListFooterComponent={(data?.pages || 0) > 1 ? (
                <View style={styles.pager}>
                  <Button label="Previous" size="small" variant="outline" disabled={page <= 1} onPress={() => setPage(page - 1)} />
                  <Text variant="caption" color={ink[500]}>Page {page} of {data.pages}</Text>
                  <Button label="Next" size="small" variant="outline" disabled={page >= data.pages} onPress={() => setPage(page + 1)} />
                </View>
              ) : null} />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  tabsWrap: { flexGrow: 0 },
  tabs: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  list: { gap: spacing.md, padding: spacing.base, paddingBottom: spacing.xxl },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
});
