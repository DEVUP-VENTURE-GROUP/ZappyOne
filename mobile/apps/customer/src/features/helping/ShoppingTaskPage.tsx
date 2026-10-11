/**
 * "Shop for Me" / "Pick Up for Me" (the website's ShoppingTaskPage). Every
 * item carries its own price ceiling, so there is no pooled budget to spend
 * unevenly, and the price is always two numbers: the service fee and the item
 * budget, never combined.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { Button, Input, ScreenHeader, Text } from '@zappy/ui/components';
import { NearestArrival } from '@zappy/ui/components/booking/NearestArrival';
import { PlaceButton } from '@zappy/ui/components/booking/PlaceButton';
import { toast } from '@zappy/ui/components/Toast';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { GrowingHere } from '../catalog/serviceability/GrowingHere';
import { HelpingCheckout } from './booking/HelpingCheckout';
import { ModeTiles } from './booking/ModeTiles';
import { ShoppingItemCard, emptyItem, type ShopItem } from './booking/ShoppingItemCard';
import { useHelpingBooking } from './booking/useHelpingBooking';

type Mode = 'shop' | 'pickup';
const rupeesToPaise = (v: string) => Math.round((Number(v) || 0) * 100);

export function ShoppingTaskPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'pickup' ? 'pickup' : 'shop');
  const [items, setItems] = useState<ShopItem[]>(() => [emptyItem()]);
  const [instructions, setInstructions] = useState('');
  const h = useHelpingBooking({ serviceType: mode === 'shop' ? 'shopping' : 'pickup', coverageLine: 'shopping_pickup' });
  const named = items.filter((i) => i.name.trim());
  const budget = useMemo(() => items.reduce((s, i) => s + rupeesToPaise(i.maxApprovedPricePaise) * (i.quantity || 1), 0), [items]);
  const payload = () => (mode === 'shop' ? named.map((i) => ({ ...i, maxApprovedPricePaise: rupeesToPaise(i.maxApprovedPricePaise) })) : []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/helping' as never));

  async function request() {
    if (!h.pickup) { toast.error(mode === 'shop' ? t('shop.whereShop', 'Where should the helper shop?') : t('shop.wherePickup', 'Where is the pickup?')); return; }
    if (mode === 'shop' && !named.length) { toast.error(t('shop.addOne', 'Add at least one item')); return; }
    await h.book({ title: mode === 'shop' ? 'Shopping task' : 'Pickup task', instructions, items: payload() });
  }

  if (h.notHere) {
    return (
      <View style={[styles.page, { paddingTop: insets.top + spacing.base, paddingHorizontal: spacing.base }]}>
        <GrowingHere service={{ code: 'shopping_pickup', domainCode: 'helping_services', name: 'shopping and pickup' }} lat={h.pickup?.lat} lng={h.pickup?.lng} address={h.pickup?.address || ''} onChangeLocation={() => h.setNotHere(false)} />
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={mode === 'shop' ? t('shop.title', 'Shopping for Me') : t('shop.pickupTitle', 'Pick Up for Me')} onBack={back} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ModeTiles<Mode> value={mode} onChange={setMode} options={[['shop', t('shop.tile', 'Shop for Me'), '/services/helping/shopping.webp'], ['pickup', t('shop.pickupTile', 'Pick Up for Me'), '/services/helping/pickup.webp']]} />
        {mode === 'shop' ? (
          <>
            <Text variant="caption" weight="bold" color={ink[500]}>{t('shop.need', 'WHAT DO YOU NEED?')}</Text>
            {items.map((it, i) => (
              <ShoppingItemCard key={it.key} item={it} index={i} removable={items.length > 1}
                onChange={(patch) => setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, ...patch } : x)))}
                onRemove={() => setItems((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== it.key) : prev))} />
            ))}
            <Pressable onPress={() => setItems((prev) => [...prev, emptyItem()])} accessibilityRole="button" style={styles.add}><Plus size={16} color={ink[500]} /><Text variant="bodySmall" weight="bold" color={ink[500]}>{t('shop.another', 'Add another item')}</Text></Pressable>
            <Input value={instructions} onChangeText={setInstructions} placeholder={t('shop.anything', 'Anything else the helper should know?')} multiline multilineHeight={56} />
          </>
        ) : (
          <Input label={t('shop.what', "What's being picked up?")} value={instructions} onChangeText={setInstructions} placeholder={t('shop.whatHint', 'e.g. Repaired laptop from City Electronics, reference #4521')} multiline multilineHeight={80} />
        )}
        <Text variant="caption" weight="bold" color={ink[500]}>{t('shop.where', 'WHERE')}</Text>
        <PlaceButton label={mode === 'shop' ? t('shop.shopPlace', 'Shop / market') : t('shop.pickupPlace', 'Pickup location')} value={h.pickup?.address} placeholder={t('petBook.chooseLoc', 'Choose a location')} onPress={h.pickPickup} />
        <NearestArrival line={mode === 'shop' ? 'shopping' : 'pickup'} loc={h.pickup} noun="helper" />
        <PlaceButton label={t('shop.bringTo', 'Bring it to')} value={h.dest?.address} placeholder={t('petBook.chooseDest', 'Choose a destination')} color={success[500]} onPress={h.pickDest} />
        <Button label={t('petBook.seePrice', 'See the price')} variant="outline" loading={h.quoting} disabled={!h.pickup || (mode === 'shop' && !named.length)} onPress={() => h.quote(payload())} fullWidth />
        <HelpingCheckout charge={h.charge} note={h.authorisationNote} surgeQuote={h.surge.quote} surgePaise={h.surge.totalPaise} tip={h.tip} onTip={h.setTip} onSite={h.setOnSite}
          itemBudgetPaise={mode === 'shop' ? budget : 0} totalLabel={t('shop.fee', 'ZappyOne service fee')} />
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.base }]}>
        <Button label={h.booking ? t('shop.requesting', 'Requesting…') : t('shop.request', 'Request a helper')} variant="secondary" loading={h.booking} disabled={!h.pickup} onPress={request} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base, paddingBottom: 140 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.large, borderWidth: 2, borderStyle: 'dashed', borderColor: slate[300] },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
