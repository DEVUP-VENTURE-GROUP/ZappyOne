/**
 * Who can do it (the website's providers step), and when nobody can, why:
 * nobody near at all (growing here, notify me), the address is outside their
 * radius, or they are fully booked for those dates.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { ArrivalBadge } from '@zappy/ui/components/booking/ArrivalBadge';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { GrowingHere } from '../../catalog/serviceability/GrowingHere';
import type { PetProvider } from './petBookingRules';

export function PetProvidersStep({ result, categoryCode, loc, onChangeLocation, onPick }: {
  result?: { providers?: PetProvider[]; nearbyCount?: number; primaryReason?: string }; categoryCode: string; loc: BookingLocation | null;
  onChangeLocation: () => void; onPick: (p: PetProvider) => void;
}) {
  const t = useT();
  const providers = result?.providers || [];
  const nearby = result?.nearbyCount || 0;
  if (!providers.length && nearby === 0) {
    return <GrowingHere service={{ code: categoryCode, domainCode: 'pet_services', name: 'pet care' }} lat={loc?.lat} lng={loc?.lng} address={loc?.address || ''} onChangeLocation={onChangeLocation} />;
  }
  const plural = (one: string, many: string) => `${nearby} ${nearby === 1 ? one : many}`;
  const empty = result?.primaryReason === 'outside_radius'
    ? `${plural('provider covers', 'providers cover')} this service nearby, but not this address. Try a location closer to town.`
    : result?.primaryReason === 'no_capacity'
      ? `${plural('provider is', 'providers are')} fully booked for those dates. Try different dates.`
      : 'No provider is free for this yet. Try a different time.';
  return (
    <View style={styles.gap}>
      <Text variant="bodySmall" weight="bold" color={ink[500]}>{providers.length} {t('petBook.available', 'providers available')}</Text>
      {!providers.length ? <Text variant="bodySmall" color={ink[400]} style={styles.center}>{empty}</Text> : providers.map((p) => (
        <Pressable key={p.capabilityId} onPress={() => onPick(p)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
          <Text variant="bodySmall" weight="bold">{p.name}</Text>
          <View style={styles.meta}>
            <Star size={11} color={accent[500]} fill={accent[500]} />
            <Text variant="caption" color={ink[500]}>{p.rating != null ? p.rating.toFixed(1) : 'New'}{p.distanceKm != null ? ` · ${p.distanceKm} km` : ''}{p.completedJobs ? ` · ${p.completedJobs} jobs` : ''}</Text>
          </View>
          {p.arrivalMinutes != null ? <ArrivalBadge minutes={p.arrivalMinutes} withinPromise={p.arrivalWithinPromise} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  center: { textAlign: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.base },
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
