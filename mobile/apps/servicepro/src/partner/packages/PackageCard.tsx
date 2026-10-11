/** One package in the partner's list: photo, state, price, capacity, places, and edit or delete while it is not live. */
import { Alert, Image, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock, Pencil, Star, Trash2, Users, Video } from 'lucide-react-native';
import { useDeleteEventThemeMutation } from '@zappy/core/api';
import { EDITABLE, PACKAGE_STATUS_LABEL } from '@zappy/core/shared/partnerBookings';
import { formatPaise } from '@zappy/core/shared/money';
import { placeName } from '@zappy/core/shared/telanganaPlaces';
import { Button, IconButton, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { accent, colors, danger, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface PartnerPackage {
  _id: string; title: string; status: string; coverImage?: string; videoUrl?: string; categoryId?: { name?: string };
  startingPricePaise?: number; guestCapacity?: { max?: number }; setupDurationMinutes?: number; rating?: number; reviewCount?: number;
  bookingCount?: number; cities?: string[]; adminNote?: string;
}

const TONE: Record<string, [string, string]> = {
  pending: [accent[50], accent[700]], approved: [success[50], success[700]], featured: [success[50], success[700]],
  hidden: [slate[100], ink[700]], rejected: [danger[50], danger[600]],
};

export function PackageCard({ pkg }: { pkg: PartnerPackage }) {
  const router = useRouter();
  const [remove, { isLoading }] = useDeleteEventThemeMutation();
  const editable = EDITABLE.includes(pkg.status);
  const [bg, fg] = TONE[pkg.status] || TONE.pending;
  const cover = webAsset(pkg.coverImage);

  function del() {
    Alert.alert('Delete this package?', `"${pkg.title}" cannot be brought back.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await remove(pkg._id).unwrap(); toast.success('Package deleted'); } catch (err) { toast.error(errText(err, 'Could not delete')); }
      } },
    ]);
  }

  return (
    <View style={styles.card}>
      <View style={styles.cover}>
        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : null}
        <View style={[styles.badge, { backgroundColor: bg }]}><Text variant="caption" weight="bold" color={fg}>{(PACKAGE_STATUS_LABEL as Record<string, string>)[pkg.status] || 'In review'}</Text></View>
        {pkg.videoUrl ? <View style={[styles.badge, styles.video]}><Video size={12} color="#fff" /><Text variant="caption" weight="bold" color="#fff">Video</Text></View> : null}
      </View>
      <View style={styles.body}>
        <Text variant="body" weight="bold">{pkg.title}</Text>
        {pkg.categoryId?.name ? <Text variant="caption" color={ink[500]}>{pkg.categoryId.name}</Text> : null}
        <Text variant="heading3" weight="black">{formatPaise(pkg.startingPricePaise)}</Text>
        <View style={styles.meta}>
          <View style={styles.fact}><Users size={12} color={ink[400]} /><Text variant="caption" color={ink[500]}>Up to {pkg.guestCapacity?.max || '–'}</Text></View>
          <View style={styles.fact}><Clock size={12} color={ink[400]} /><Text variant="caption" color={ink[500]}>{Math.round((pkg.setupDurationMinutes || 120) / 6) / 10} h setup</Text></View>
          {pkg.reviewCount ? <View style={styles.fact}><Star size={12} color={accent[500]} /><Text variant="caption" color={ink[500]}>{Number(pkg.rating).toFixed(1)}</Text></View> : null}
          <Text variant="caption" color={ink[500]}>{pkg.bookingCount || 0} booked</Text>
        </View>
        {pkg.cities?.length ? <Text variant="caption" color={ink[500]}>{pkg.cities.map(placeName).join(', ')}</Text> : null}
        {pkg.status === 'rejected' && pkg.adminNote ? <Text variant="caption" weight="semibold" color={danger[600]}>{pkg.adminNote}</Text> : null}
        {editable ? (
          <View style={styles.actions}>
            <Button label="Edit" size="small" variant="outline" icon={<Pencil size={14} color={zappy[600]} />} onPress={() => router.push(`/partner/packages/${pkg._id}` as never)} style={styles.flex} />
            <IconButton icon={<Trash2 size={16} color={danger[600]} />} accessibilityLabel={`Delete ${pkg.title}`} onPress={del} disabled={isLoading} />
          </View>
        ) : <Text variant="caption" color={ink[400]}>Live packages are changed through support, so bookings already made stay as sold.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cover: { height: 160, backgroundColor: slate[100] },
  badge: { position: 'absolute', left: spacing.md, top: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  video: { left: undefined, right: spacing.md, backgroundColor: 'rgba(0,0,0,0.55)' },
  body: { gap: 4, padding: spacing.base },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
});
