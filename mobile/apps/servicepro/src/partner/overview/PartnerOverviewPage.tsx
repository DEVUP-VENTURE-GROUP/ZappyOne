/**
 * What needs the partner today (the events website's OverviewPage): requests
 * waiting for an answer, what is coming up, and what they have earned. Every
 * number comes from the server.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, CalendarCheck, Images, Star } from 'lucide-react-native';
import { usePartnerBookingsQuery, usePartnerNotificationsQuery, usePartnerOverviewQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { IconButton, LoadingState, Text } from '@zappy/ui/components';
import { colors, danger, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { usePartner } from '../usePartner';
import { VerifyFirst } from '../VerifyFirst';
import { BookingPreview } from './BookingPreview';
import { OverviewShortcut } from './OverviewShortcut';
import { OverviewStat } from './OverviewStat';

export function PartnerOverviewPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { partner, verified, refetch: refetchMe } = usePartner();
  const { data, isLoading, refetch, isFetching } = usePartnerOverviewQuery(undefined, { pollingInterval: 60000 });
  const { data: newOnes } = usePartnerBookingsQuery({ status: 'confirmed' }, { skip: !verified });
  const { data: upcoming } = usePartnerBookingsQuery({ status: 'upcoming' }, { skip: !verified });
  const { data: notes } = usePartnerNotificationsQuery({ page: 1, unreadOnly: false }, { pollingInterval: 30000 });
  const unread: number = notes?.unread || 0;

  if (isLoading && !partner) return <View style={[styles.page, { paddingTop: insets.top }]}><LoadingState /></View>;
  const s = data?.stats || {};
  const rating = partner?.reviewCount ? Number(partner.rating).toFixed(1) : null;
  const refresh = () => { refetch(); refetchMe(); };

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.base }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refresh} />}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="heading2" weight="black">Hello, {partner?.ownerName?.split(' ')[0] || partner?.businessName || 'partner'}</Text>
          <Text variant="bodySmall" color={ink[500]}>{partner?.businessName}{verified ? ', Verified partner' : ''}</Text>
        </View>
        <View>
          <IconButton icon={<Bell size={20} color={ink[700]} />} accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} onPress={() => router.push('/partner/notifications' as never)} />
          {unread ? <View style={styles.dot}><Text variant="caption" weight="bold" color="#fff">{unread > 9 ? '9+' : unread}</Text></View> : null}
        </View>
      </View>

      {!verified ? <VerifyFirst kycStatus={partner?.kyc?.status} inset={false} /> : null}

      <View style={styles.stats}>
        <OverviewStat label="New requests" value={String(s.pendingConfirmations ?? 0)} hint="Waiting for your answer" />
        <OverviewStat label="Next 7 days" value={String(s.upcomingEvents ?? 0)} hint="Events to set up" />
        <OverviewStat label="Live packages" value={String(s.themes ?? 0)} />
        <OverviewStat label="Earned so far" value={formatPaise(s.netEarningsPaise)} hint="After ZappyOne's commission" />
      </View>

      {verified ? (
        <>
          <BookingPreview title="New requests" empty="No new requests right now." rows={newOnes?.bookings} filter="confirmed" />
          <BookingPreview title="Coming up" empty="Nothing accepted yet." rows={upcoming?.bookings} filter="upcoming" />
        </>
      ) : null}

      <OverviewShortcut Icon={Images} title="Add a package" text="Photos, price and what is included" to="/partner/packages/new" locked={!verified} />
      <OverviewShortcut Icon={CalendarCheck} title="Block dates" text="Days you are not available" to="/partner/calendar" locked={!verified} />
      <View style={styles.rating}>
        <Star size={18} color={zappy[600]} />
        <View>
          <Text variant="bodySmall" weight="bold">{rating ? `${rating} rating` : 'No ratings yet'}</Text>
          <Text variant="caption" color={ink[500]}>{partner?.completedEvents || 0} events completed</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base, paddingBottom: spacing.xxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  dot: { position: 'absolute', right: 0, top: 0, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: danger[500] },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  rating: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
