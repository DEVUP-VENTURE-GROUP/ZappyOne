/**
 * One event booking (the website's EventBookingDetailPage): the start code for
 * the decor team, where it is, when and where, what is paid, the decorator,
 * their setup photos, and a review once done. Paying finishes on the website.
 */
import { useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Clock, CreditCard, MapPin, Phone, Users } from 'lucide-react-native';
import { useGetEventBookingQuery } from '@zappy/core/api';
import { Button, EmptyState, ErrorState, IconButton, ScreenHeader, Skeleton, Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { callNumber } from '@zappy/ui/lib/openLink';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { StartCodeCard } from '../tracking/cards/StartCodeCard';
import { payBookingOnWeb } from './bookOnWeb';
import { CancelEventSheet } from './booking/CancelEventSheet';
import { EventPaymentCard } from './booking/EventPaymentCard';
import { EventTimeline } from './booking/EventTimeline';
import { RateEvent } from './booking/RateEvent';
import { SetupPhotos } from './booking/SetupPhotos';
import { BookingFact as Fact } from './booking/BookingFact';
import { eventDay, statusOf } from './eventStatus';
import { rupees } from './ThemeCard';

const PARTNER_SHOWN = ['confirmed', 'partner_assigned', 'in_progress', 'completed'];

export function EventBookingDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading, isError, refetch, isFetching } = useGetEventBookingQuery(id, { skip: !id });
  const [cancelling, setCancelling] = useState(false);
  const booking = data?.booking;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/events/bookings' as never));

  const header = <ScreenHeader title={t('events.booking', 'Event booking')} subtitle={booking ? statusOf(booking.status).label : undefined} onBack={back} />;
  if (isLoading) return <View style={[styles.page, { paddingTop: insets.top }]}>{header}<View style={styles.body}><Skeleton height={88} borderRadius={radius.large} /><Skeleton height={200} borderRadius={radius.large} /></View></View>;
  if (isError && !booking) return <View style={[styles.page, { paddingTop: insets.top }]}>{header}<ErrorState onRetry={refetch} /></View>;
  if (!booking) return <View style={[styles.page, { paddingTop: insets.top }]}>{header}<EmptyState title={t('events.notFound', 'Booking not found')} actionLabel={t('events.myBookings', 'My event bookings')} onAction={() => router.replace('/events/bookings' as never)} /></View>;

  const { status } = booking;
  const st = statusOf(status);
  const advancePaid = booking.advancePayment?.status === 'paid';
  const remainingPaid = booking.remainingPayment?.status === 'paid';
  const canCancel = ['confirmed', 'pending_payment'].includes(status);
  const payAdvance = status === 'pending_payment';
  const payBalance = !payAdvance && status !== 'cancelled' && advancePaid && !remainingPaid;
  const codeStage = status === 'partner_assigned' ? 'arrived' : status === 'confirmed' ? 'on_the_way' : null;
  const cover = webAsset(booking.themeId?.coverImage);
  const partner = booking.partnerId;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {header}
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}>
        {codeStage && booking.startCode ? <StartCodeCard jobKey={`event:${booking._id}`} code={booking.startCode} stage={codeStage} noun="decor team" /> : null}
        {st.step >= 0 ? <EventTimeline step={st.step} /> : null}

        <View style={styles.card}>
          {cover ? <Image source={{ uri: cover }} style={styles.cover} /> : null}
          <View style={styles.info}>
            <Text variant="heading3" weight="black">{booking.themeId?.title || 'Event'}</Text>
            <Fact icon={<Calendar size={14} color={zappy[600]} />} text={eventDay(booking.eventDate)} />
            {booking.eventTimeSlot ? <Fact icon={<Clock size={14} color={zappy[600]} />} text={booking.eventTimeSlot} /> : null}
            <Fact icon={<MapPin size={14} color={zappy[600]} />} text={[booking.address?.line1, booking.address?.city].filter(Boolean).join(', ')} />
            {booking.guestCount ? <Fact icon={<Users size={14} color={zappy[600]} />} text={`${booking.guestCount} guests`} /> : null}
            {booking.notes ? <Text variant="caption" color={ink[500]}>{booking.notes}</Text> : null}
          </View>
        </View>

        <EventPaymentCard pricing={booking.pricing} advancePaid={advancePaid} remainingPaid={remainingPaid} />

        {partner?.businessName && PARTNER_SHOWN.includes(status) ? (
          <View style={[styles.card, styles.partner]}>
            <View style={styles.initial}><Text variant="heading3" weight="black" color={zappy[700]}>{partner.businessName[0]?.toUpperCase()}</Text></View>
            <View style={styles.info}>
              <Text variant="caption" weight="bold" color={ink[500]}>{t('events.decorator', 'YOUR DECORATOR')}</Text>
              <Text variant="bodySmall" weight="black">{partner.businessName}</Text>
              <Text variant="caption" color={ink[500]}>★ {partner.reviewCount ? Number(partner.rating).toFixed(1) : 'New'} · {partner.completedEvents || 0} events</Text>
            </View>
            {partner.phone ? <IconButton icon={<Phone size={18} color={zappy[600]} />} accessibilityLabel={t('events.call', 'Call the decorator')} onPress={() => callNumber(partner.phone)} /> : null}
          </View>
        ) : null}

        <SetupPhotos photos={booking.setupPhotos} />
        <RateEvent booking={booking} />

        {payAdvance ? <Button label={`Pay advance ${rupees(booking.pricing?.advancePaise)} on zappyone.com`} icon={<CreditCard size={16} color="#fff" />} onPress={() => payBookingOnWeb(booking._id)} fullWidth /> : null}
        {payBalance ? <Button label={`Pay balance ${rupees(booking.pricing?.remainingPaise)} on zappyone.com`} variant="success" icon={<CreditCard size={16} color="#fff" />} onPress={() => payBookingOnWeb(booking._id)} fullWidth /> : null}
        {canCancel ? <Button label={t('events.cancel', 'Cancel booking')} variant="dangerGhost" onPress={() => setCancelling(true)} fullWidth /> : null}
      </ScrollView>
      {canCancel ? <CancelEventSheet id={booking._id} paid={advancePaid} visible={cancelling} onClose={() => setCancelling(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cover: { width: '100%', height: 150 },
  info: { flex: 1, gap: 6, padding: spacing.base },
  partner: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.base, paddingRight: spacing.sm },
  initial: { width: 44, height: 44, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
});
