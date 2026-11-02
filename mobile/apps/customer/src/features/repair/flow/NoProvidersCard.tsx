/**
 * Nobody to show for this repair (the website's no-providers card), saying
 * what is actually wrong. Nobody covers the address: GrowingHere. Shops are
 * near but none priced this repair: ask them. Technicians near but offline:
 * book at the lowest nearby price for whoever comes online first. Otherwise an
 * inspection holds the place.
 */
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Check, ChevronRight, MapPin, ShieldCheck, Store, Wrench } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useCreatePriceRequestMutation } from '@zappy/core/api';
import { doorAddress } from '@zappy/core/shared/doorAddress';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { ink, slate, success, zappy } from '@zappy/ui/theme/colors';
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
  const bookNow = !!standardPaise && !needsDiagnosis && data?.reason !== 'service_mode_not_allowed';

  if (!bookNow && (locationProblem || (nearby === 0 && !data?.reason))) {
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
  if (bookNow) { title = `Book now for ${formatPaise(standardPaise!)}`; body = 'Nobody is listed this minute. Book and we give it to the nearest ZappyOne pro the moment one is free, usually within minutes. You are told when someone accepts, and you can cancel free until then.'; }
  else if (data?.reason === 'service_mode_not_allowed') body = 'This repair cannot be done the way you chose. Go back and pick another option.';
  else if (notListed) { title = `${plural('shop')} near you, none has priced ${repairName} yet`; body = 'Ask them: each shop sends its price, and you book the one you like. Or book an inspection for a firm quote.'; }
  else if (nearby > 0 && data?.primaryReason === 'offline') {
    title = `${plural('technician')} near you, none online this minute`;
    body = 'Try again shortly, or book an inspection to hold your place.';
  } else if (nearby > 0) { title = `${plural('shop')} near you, none free right now`; body = 'Try again shortly, or book an inspection to hold your place.'; }

  const others = ([
    notListed && !needsDiagnosis ? { key: 'ask', Icon: Store, title: 'Ask nearby shops for their price', sub: 'Each shop sends its own price. You pick one.', onPress: askShops, busy: asking } : null,
    nearby > 0 && onInspectInstead ? { key: 'inspect', Icon: ShieldCheck, title: 'Book an inspection instead', sub: 'A pro checks it first, then gives you a quote to approve.', onPress: onInspectInstead, busy: false } : null,
    nearby === 0 ? { key: 'loc', Icon: MapPin, title: 'Change location', sub: 'A nearby area may have someone free.', onPress: onChangeLocation, busy: false } : null,
  ].filter(Boolean)) as { key: string; Icon: LucideIcon; title: string; sub: string; onPress: () => void; busy: boolean }[];
  const mark = webAsset('/branding/zappy-mark.webp');

  return (
    <View style={[flow.card, styles.card]}>
      <View style={styles.body}>
        {bookNow ? (
          <>
            <View style={styles.head}>
              <View style={[styles.badge, { backgroundColor: zappy[50] }]}>{mark ? <Image source={{ uri: mark }} style={styles.mark} resizeMode="contain" /> : null}</View>
              <View style={styles.flex}>
                <Text variant="bodyLarge" weight="extrabold">Nearest ZappyOne pro</Text>
                <Text variant="bodySmall" color={ink[500]}>Nobody has listed this repair right now. We send it to the closest pro who is free.</Text>
              </View>
              <Text variant="heading3" weight="extrabold">{formatPaise(standardPaise!)}</Text>
            </View>
            {['Verified, ID-checked professional', 'Nothing extra is charged without your OK', 'Free to cancel until a pro accepts'].map((t) => (
              <View key={t} style={styles.tickRow}>
                <View style={styles.tick}><Check size={13} strokeWidth={3} color={success[700]} /></View>
                <Text variant="bodySmall" color={ink[700]} style={styles.flex}>{t}</Text>
              </View>
            ))}
            <Button label={`Book now · ${formatPaise(standardPaise!)}`} size="large" onPress={onBookStandard} fullWidth />
          </>
        ) : (
          <View style={styles.head}>
            <View style={[styles.badge, { backgroundColor: slate[100] }]}><Wrench size={22} color={ink[500]} /></View>
            <View style={styles.flex}>
              <Text variant="bodyLarge" weight="extrabold">{title}</Text>
              <Text variant="bodySmall" color={ink[500]}>{body}</Text>
            </View>
          </View>
        )}
      </View>
      {others.length ? (
        <View style={styles.others}>
          {bookNow ? <Text variant="caption" weight="bold" color={ink[400]} style={styles.otherLabel}>OTHER WAYS</Text> : null}
          {others.map(({ key, Icon, title: t, sub, onPress, busy }) => (
            <Pressable key={key} onPress={onPress} disabled={busy} accessibilityRole="button" style={styles.other}>
              <View style={styles.otherIcon}>{busy ? <ActivityIndicator size="small" color={ink[700]} /> : <Icon size={18} color={ink[900]} />}</View>
              <View style={styles.flex}>
                <Text variant="body" weight="semibold">{t}</Text>
                <Text variant="caption" color={ink[500]}>{sub}</Text>
              </View>
              <ChevronRight size={18} color={ink[400]} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  body: { gap: spacing.md, padding: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  badge: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 28, height: 28 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tick: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECFDF3' },
  others: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: slate[300] },
  otherLabel: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, letterSpacing: 0.8 },
  other: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  otherIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
});
