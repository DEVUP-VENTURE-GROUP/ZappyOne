/**
 * The customer's price request (the website's PriceRequestPage): the shops
 * around them were asked for their price; answers arrive live and each is
 * booked like any shop booking, with a second tap to confirm.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, X } from 'lucide-react-native';
import { useCancelPriceRequestMutation, useCreateRepairBookingMutation, usePriceRequestQuery } from '@zappy/core/api';
import { useSocketEvent } from '@zappy/core/hooks/useSocketEvent';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { ShopOfferCard, type ShopOffer } from './ShopOfferCard';

function timeLeft(at?: string) {
  const ms = at ? new Date(at).getTime() - Date.now() : 0;
  if (ms <= 0) return null;
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export function PriceRequestPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = usePriceRequestQuery(id, { pollingInterval: 30000 });
  const [cancel, { isLoading: cancelling }] = useCancelPriceRequestMutation();
  const [book, { isLoading: booking }] = useCreateRepairBookingMutation();
  const [confirming, setConfirming] = useState<string | null>(null);
  useSocketEvent('price_request.offer', (p) => { if (p?.id === id) refetch(); });

  const r = data?.request;
  const offers: ShopOffer[] = useMemo(() => {
    const byShop = new Map((r?.offers || []).map((o: { shopId: string }) => [String(o.shopId), o]));
    const price = (p: ShopOffer) => p.offer?.totalPaise ?? p.totalPaise ?? 0;
    return (data?.providers || []).map((p: ShopOffer) => ({ ...p, offer: byShop.get(String(p.shopId)) })).sort((a: ShopOffer, b: ShopOffer) => price(a) - price(b));
  }, [data, r]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));

  if (isLoading) return <LoadingState />;
  if (!r) return <View style={[styles.page, { paddingTop: insets.top }]}><ScreenHeader title="Price request" onBack={back} /><EmptyState title="We could not find that request" actionLabel="Go home" onAction={() => router.replace('/' as never)} /></View>;

  const open = r.status === 'open';
  const left = timeLeft(r.expiresAt);

  async function choose(p: ShopOffer) {
    if (confirming !== p.shopId) { setConfirming(p.shopId); return; }
    try {
      const res = await book({
        vertical: r.vertical, brandCode: r.brandCode, modelCode: r.modelCode, configurationCode: r.configurationCode || null,
        problemCodes: r.problemCodes, repairCode: r.repairCode, qualityCode: p.offer?.qualityCode || null,
        serviceMode: r.serviceMode, shopId: p.shopId, workerId: null,
        location: { coordinates: r.location.coordinates, address: r.location.address || 'Your location' },
        paymentMethod: 'cash', idempotencyKey: `pr-${r._id}-${p.shopId}`, priceRequestId: r._id,
      }).unwrap();
      toast.success(`Booked with ${p.name}`);
      router.replace(`/repair/bookings/${res.booking._id}` as never);
    } catch (err) { toast.error(errText(err, 'Could not book that shop. Try again.')); }
  }

  async function stop() {
    try { await cancel(r._id).unwrap(); toast.success('Request closed'); refetch(); }
    catch (err) { toast.error(errText(err, 'Could not close it. Try again.')); }
  }

  const status = r.status === 'booked' ? 'You booked one of these shops.' : r.status === 'cancelled' ? 'You closed this request.' : 'This request has closed.';
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={`${r.repairName}, ${r.deviceName}`} subtitle="Prices from shops near you" onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.card}>
          {open ? (
            <>
              <Text variant="bodySmall" weight="bold">{offers.length ? `${offers.length} of ${r.shopsAsked} shops sent their price` : `We asked ${r.shopsAsked} ${r.shopsAsked === 1 ? 'shop' : 'shops'} near you`}</Text>
              <View style={styles.inline}><Clock size={12} color={ink[500]} /><Text variant="caption" color={ink[500]}>{left ? `Open for ${left} more. Prices appear here as they come in.` : 'Closing now.'}</Text></View>
            </>
          ) : <Text variant="bodySmall" weight="bold">{status}</Text>}
        </View>
        {open && !offers.length ? (
          <View style={[styles.card, styles.inline]}>
            <ActivityIndicator color={zappy[500]} />
            <Text variant="caption" color={ink[700]} style={styles.flex}>Shops usually answer within the hour. You will get a notification for each price.</Text>
          </View>
        ) : null}
        {offers.map((p) => <ShopOfferCard key={p.shopId} p={p} open={open} confirming={confirming === p.shopId} booking={booking} onChoose={() => choose(p)} />)}
        {!open && r.status !== 'booked' ? <Button label="Book an inspection instead" variant="secondary" onPress={() => router.replace('/repair' as never)} fullWidth /> : null}
        {open ? <Button label="Close this request" variant="outline" size="small" loading={cancelling} icon={<X size={13} color={ink[700]} />} onPress={stop} fullWidth /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
