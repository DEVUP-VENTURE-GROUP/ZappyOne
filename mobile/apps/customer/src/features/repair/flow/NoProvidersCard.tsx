/**
 * Nobody to show for this repair (the website's no-providers card), saying
 * what is actually wrong. Nobody covers the address: GrowingHere. Shops are
 * near but none priced this repair: ask them. Technicians near but offline:
 * book at the standard price for whoever comes online first. Otherwise an
 * inspection holds the place.
 */
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, MapPin, ShieldCheck, Store, Wrench } from 'lucide-react-native';
import { useCreatePriceRequestMutation } from '@zappy/core/api';
import { doorAddress } from '@zappy/core/shared/doorAddress';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { ink, slate } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { GrowingHere } from '../../catalog/serviceability/GrowingHere';
import { flow } from './FlowChrome';

export interface ProvidersResult { nearbyCount?: number; reason?: string; primaryReason?: string; repairName?: string }

export function NoProvidersCard({ data, vertical, request, location, standardPaise, needsDiagnosis, onBookStandard, onInspectInstead, onChangeLocation }: {
  data?: ProvidersResult; vertical: string; location: BookingLocation; standardPaise: number | null; needsDiagnosis?: boolean;
  request: { brandCode?: string; modelCode?: string; configurationCode?: string | null; problemCodes: string[]; repairCode: string; serviceMode: string };
  onBookStandard: () => void; onInspectInstead?: () => void; onChangeLocation: () => void;
}) {
  const router = useRouter();
  const [askPrices, { isLoading: asking }] = useCreatePriceRequestMutation();
  const nearby = data?.nearbyCount || 0;
  const repairName = data?.repairName || 'this repair';
  const locationProblem = data?.reason === 'no_provider_in_area';
  const notListed = nearby > 0 && ['no_capability', 'capability_scope', 'no_approved_price'].includes(data?.primaryReason || '');
  const allOffline = nearby > 0 && data?.primaryReason === 'offline';

  if (locationProblem || (nearby === 0 && !data?.reason)) {
    return <GrowingHere service={{ code: vertical, name: data?.repairName || 'repair' }} lat={location.lat} lng={location.lng} address={location.address} onChangeLocation={onChangeLocation} />;
  }

  async function askShops() {
    try {
      const res = await askPrices({ vertical, ...request, location: { coordinates: [location.lng, location.lat], address: doorAddress(location) } }).unwrap();
      router.push(`/repair/price-requests/${res.request._id}` as never);
    } catch (err) { toast.error(errText(err, 'Could not ask the shops. Try again.')); }
  }

  const plural = (word: string) => `${nearby} ${nearby === 1 ? word : `${word}s`}`;
  let title = 'No technicians available right now';
  let body = 'We could not find anyone able to do this repair today.';
  if (data?.reason === 'service_mode_not_allowed') body = 'This repair cannot be done the way you chose. Go back and pick another option.';
  else if (notListed) { title = `${plural('shop')} near you, none has priced ${repairName} yet`; body = 'Ask them: each shop sends its price, and you book the one you like. Or book an inspection for a firm quote.'; }
  else if (allOffline) {
    title = `${plural('technician')} near you, none online this minute`;
    body = standardPaise ? 'Book now and we will offer it to the first one who comes online. You will be told the moment someone accepts, and you can cancel free until then.' : 'Try again shortly, or book an inspection to hold your place.';
  } else if (nearby > 0) { title = `${plural('shop')} near you, none free right now`; body = 'Try again shortly, or book an inspection to hold your place.'; }

  return (
    <View style={[flow.card, styles.card]}>
      <Wrench size={24} color={slate[300]} />
      <Text variant="bodySmall" weight="bold" color={ink[700]} style={styles.center}>{title}</Text>
      <Text variant="caption" color={ink[500]} style={styles.center}>{body}</Text>
      <View style={styles.actions}>
        {allOffline && standardPaise ? <Button label={`Book now for ${formatPaise(standardPaise)}`} size="small" icon={<Check size={14} color="#fff" />} onPress={onBookStandard} /> : null}
        {notListed && !needsDiagnosis ? <Button label="Ask nearby shops for their price" size="small" loading={asking} icon={<Store size={14} color="#fff" />} onPress={askShops} /> : null}
        {nearby > 0 && onInspectInstead ? <Button label="Book an inspection instead" size="small" variant="secondary" icon={<ShieldCheck size={14} color={ink[700]} />} onPress={onInspectInstead} /> : null}
        {nearby === 0 ? <Button label="Change location" size="small" variant="outline" icon={<MapPin size={14} color={ink[700]} />} onPress={onChangeLocation} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
});
