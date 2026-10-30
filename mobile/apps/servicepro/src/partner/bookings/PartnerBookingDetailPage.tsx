/**
 * One booking, worked from top to bottom (the events website's
 * BookingDetailPage): what, when, where, the customer's notes and room
 * photos, then the next step. Setup photos are the proof the customer sees;
 * a finished one is required to complete. Starting needs the host's code.
 */
import { useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, Clock, MapPin, Navigation, Phone, StickyNote, Users, XCircle } from 'lucide-react-native';
import { usePartnerBookingQuery, useUpdatePartnerBookingStatusMutation } from '@zappy/core/api';
import { AFTER_OPEN, BEFORE_OPEN, NEXT_STEP, PHOTO_STATES } from '@zappy/core/shared/partnerBookings';
import { formatPaise } from '@zappy/core/shared/money';
import { placeName } from '@zappy/core/shared/telanganaPlaces';
import { Button, EmptyState, ErrorState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { useStartCodePrompt } from '@zappy/ui/components/worker/StartCodePrompt';
import { directions } from '@zappy/ui/lib/directions';
import { errText } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { callNumber } from '@zappy/ui/lib/openLink';
import { colors, danger, ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PartnerStatusChip } from '../PartnerStatusChip';
import { DeclineSheet } from './DeclineSheet';
import { InfoRow } from './InfoRow';
import { PhotoStrip } from './PhotoStrip';
import { SetupPhotoStage } from './SetupPhotoStage';

const longDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '–');

export function PartnerBookingDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerBookingQuery(id, { skip: !id });
  const [advance, { isLoading: moving }] = useUpdatePartnerBookingStatusMutation();
  const gate = useStartCodePrompt();
  const [declining, setDeclining] = useState(false);
  const b = data?.booking;

  if (isLoading) return <View style={styles.page}><ScreenHeader title="Booking" safeArea /><LoadingState /></View>;
  if (isError && !b) return <View style={styles.page}><ScreenHeader title="Booking" safeArea /><ErrorState onRetry={refetch} /></View>;
  if (!b) return <View style={styles.page}><ScreenHeader title="Booking" safeArea /><EmptyState title="This booking could not be found." /></View>;

  const step = (NEXT_STEP as Record<string, { to: string; label: string; needsCode?: boolean; needsAfterPhoto?: boolean }>)[b.status];
  const afterCount = b.setupPhotos?.after?.length || 0;
  const blocked = !!step?.needsAfterPhoto && !afterCount;
  const cover = webAsset(b.themeId?.coverImage);

  async function next() {
    if (!step) return;
    try {
      const run = (code?: string) => advance({ id, status: step.to, code }).unwrap();
      const done = step.needsCode ? await gate.run(run) : await run();
      if (done !== null) toast.success(step.to === 'completed' ? 'Booking completed' : 'Updated');
    } catch (err) { toast.error(errText(err, 'Could not update. Try again.')); }
  }

  return (
    <View style={styles.page}>
      {gate.prompt}
      <ScreenHeader title="Booking" safeArea />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}>
        <View style={styles.card}>
          <View style={styles.row}>
            {cover ? <Image source={{ uri: cover }} style={styles.cover} /> : null}
            <View style={styles.flex}>
              <Text variant="heading3" weight="black">{b.themeId?.title || 'Event'}</Text>
              <Text variant="caption" color={ink[500]}>{longDate(b.eventDate)}{b.eventTimeSlot ? `, ${b.eventTimeSlot}` : ''}</Text>
              <PartnerStatusChip status={b.status} />
            </View>
          </View>
          <View style={styles.money}>
            <View style={styles.flex}><Text variant="caption" color={ink[500]}>Customer pays</Text><Text variant="body" weight="bold">{formatPaise(b.pricing?.totalPaise)}</Text></View>
            <View style={styles.flex}><Text variant="caption" color={ink[500]}>You get</Text><Text variant="body" weight="bold" color={success[700]}>{formatPaise(b.payout?.netPaise)}</Text></View>
          </View>
        </View>

        <View style={styles.card}>
          <InfoRow Icon={Users} label="Customer" value={b.userId?.name || 'Customer'}>
            {b.userId?.phone ? <Button label="Call" size="small" variant="outline" icon={<Phone size={14} color={zappy[600]} />} onPress={() => callNumber(b.userId.phone)} /> : null}
          </InfoRow>
          <InfoRow Icon={MapPin} label="Venue" value={[b.address?.line1, placeName(b.address?.city), b.address?.pincode].filter(Boolean).join(', ')}>
            {b.address?.lat ? <Button label="Directions" size="small" variant="outline" icon={<Navigation size={14} color={zappy[600]} />} onPress={() => directions(b.address.lat, b.address.lng)} /> : null}
          </InfoRow>
          <InfoRow Icon={Users} label="Guests" value={String(b.guestCount || 1)} />
          <InfoRow Icon={Clock} label="Setup time" value={`About ${Math.round((b.themeId?.setupDurationMinutes || 120) / 60 * 10) / 10} hours`} />
          {b.notes ? <InfoRow Icon={StickyNote} label="Customer's note" value={b.notes} /> : null}
        </View>

        {b.roomPhotos?.length ? (
          <View style={styles.card}>
            <Text variant="bodySmall" weight="bold">The customer's room</Text>
            <PhotoStrip photos={b.roomPhotos} />
          </View>
        ) : null}

        {PHOTO_STATES.includes(b.status) ? (
          <View style={styles.card}>
            <View>
              <Text variant="bodySmall" weight="bold">Setup photos</Text>
              <Text variant="caption" color={ink[500]}>The customer sees these. At least one finished photo is needed to complete.</Text>
            </View>
            <SetupPhotoStage id={id} stage="before" title="Before you start" photos={b.setupPhotos?.before} enabled={BEFORE_OPEN.includes(b.status)} />
            <SetupPhotoStage id={id} stage="after" title="Finished setup" photos={b.setupPhotos?.after} enabled={AFTER_OPEN.includes(b.status)} lockedText="Add these once the setup has started" />
          </View>
        ) : null}
      </ScrollView>

      {step ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.row}>
            {b.status === 'confirmed' ? <Button label="Decline" variant="outline" icon={<XCircle size={16} color={danger[600]} />} onPress={() => setDeclining(true)} style={styles.flex} /> : null}
            <Button label={blocked ? 'Add a finished photo first' : step.label} icon={<CheckCircle2 size={16} color="#fff" />} loading={moving} disabled={blocked} onPress={next} style={styles.grow} />
          </View>
          {step.needsCode ? <Text variant="caption" color={ink[500]} style={styles.center}>Ask the host for their start code when you arrive.</Text> : null}
        </View>
      ) : null}
      {b.status === 'confirmed' ? <DeclineSheet id={id} visible={declining} onClose={() => setDeclining(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 4 },
  grow: { flex: 2 },
  cover: { width: 72, height: 72, borderRadius: radius.medium },
  money: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  center: { textAlign: 'center' },
});
