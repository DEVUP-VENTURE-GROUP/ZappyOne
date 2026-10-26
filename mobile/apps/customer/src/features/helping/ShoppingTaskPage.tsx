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
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { GrowingHere } from '../catalog/serviceability/GrowingHere';
import { HelpingCheckout } from './booking/HelpingCheckout';
import { ModeTiles } from './booking/ModeTiles';
import { ShoppingItemCard, emptyItem, type ShopItem } from './booking/ShoppingItemCard';
import { useHelpingBooking } from './booking/useHelpingBooking';
import { HELP_MODES, helpModeFrom } from '@zappy/core/shared/helpModes';
import { useLiveCatalogQuery } from '@zappy/core/api';
import { LoadingState } from '@zappy/ui/components';
import { SlotPicker } from '@zappy/ui/components/booking/SlotPicker';

type Mode = string;
const rupeesToPaise = (v: string) => Math.round((Number(v) || 0) * 100);

export function ShoppingTaskPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode || 'shop');
  // Family Assist and later services bring their form from the catalog (shared/customer/helpModes).
  const { data: catalog, isLoading: catalogLoading } = useLiveCatalogQuery(undefined);
  const found = helpModeFrom(catalog, mode);
  const spec = found || HELP_MODES.shop;
  const shopping = !!spec.items;
  const [items, setItems] = useState<ShopItem[]>(() => [emptyItem()]);
  const [instructions, setInstructions] = useState('');
  const [when, setWhen] = useState<Date | null>(null);
  const h = useHelpingBooking({ serviceType: spec.type, coverageLine: spec.line, homeFirst: !!spec.home, draft: { title: spec.draft || spec.title, path: `/helping/shopping?mode=${mode}` } });
  const named = items.filter((i) => i.name.trim());
  const budget = useMemo(() => items.reduce((s, i) => s + rupeesToPaise(i.maxApprovedPricePaise) * (i.quantity || 1), 0), [items]);
  const payload = () => (shopping ? named.map((i) => ({ ...i, maxApprovedPricePaise: rupeesToPaise(i.maxApprovedPricePaise) })) : []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/helping' as never));

  async function request() {
    if (!h.pickup) { toast.error(mode === 'shop' ? t('shop.whereShop', 'Where should the helper shop?') : mode === 'pickup' ? t('shop.wherePickup', 'Where is the pickup?') : spec.start); return; }
    if (spec.endRequired && !h.dest) { toast.error(spec.end); return; }
    if (shopping && !named.length) { toast.error(t('shop.addOne', 'Add at least one item')); return; }
    if (spec.when && !when) { toast.error(t('assist.pickTime', 'Pick a day and time')); return; }
    await h.book({ title: spec.task || spec.title, instructions, items: payload(), ...(when && { scheduledAt: when.toISOString() }) });
  }

  if (!found && catalogLoading) {
    return <View style={[styles.page, { paddingTop: insets.top }]}><LoadingState rows={4} /></View>;
  }
  if (h.notHere) {
    return (
      <View style={[styles.page, { paddingTop: insets.top + spacing.base, paddingHorizontal: spacing.base }]}>
        <GrowingHere service={{ code: spec.line, domainCode: 'family_assist', name: spec.assist ? spec.title.toLowerCase() : 'shopping and pickup' }} lat={h.pickup?.lat} lng={h.pickup?.lng} address={h.pickup?.address || ''} onChangeLocation={() => h.setNotHere(false)} />
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={mode === 'shop' ? t('shop.title', 'Shopping for Me') : mode === 'pickup' ? t('shop.pickupTitle', 'Pick Up for Me') : spec.title} onBack={back} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {spec.assist ? (
          <View style={styles.blurb}><Text variant="bodySmall" weight="semibold" color={zappy[800]}>{spec.blurb}</Text></View>
        ) : (
          <ModeTiles<Mode> value={mode} onChange={setMode} options={[['shop', t('shop.tile', 'Shop for Me'), '/services/helping/shopping.webp'], ['pickup', t('shop.pickupTile', 'Pick Up for Me'), '/services/helping/pickup.webp']]} />
        )}
        {shopping ? (
          <>
            <Text variant="caption" weight="bold" color={ink[500]}>{t('shop.need', 'WHAT DO YOU NEED?')}</Text>
            {items.map((it, i) => (
              <ShoppingItemCard key={it.key} item={it} index={i} removable={items.length > 1} photoLabel={spec.photo}
                onChange={(patch) => setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, ...patch } : x)))}
                onRemove={() => setItems((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== it.key) : prev))} />
            ))}
            <Pressable onPress={() => setItems((prev) => [...prev, emptyItem()])} accessibilityRole="button" style={styles.add}><Plus size={16} color={ink[500]} /><Text variant="bodySmall" weight="bold" color={ink[500]}>{t('shop.another', 'Add another item')}</Text></Pressable>
            <Input value={instructions} onChangeText={setInstructions} placeholder={spec.hint || t('shop.anything', 'Anything else the helper should know?')} multiline multilineHeight={56} />
          </>
        ) : (
          <Input label={mode === 'pickup' ? t('shop.what', "What's being picked up?") : spec.ask} value={instructions} onChangeText={setInstructions} placeholder={mode === 'pickup' ? t('shop.whatHint', 'e.g. Repaired laptop from City Electronics, reference #4521') : spec.hint} multiline multilineHeight={80} />
        )}
        <Text variant="caption" weight="bold" color={ink[500]}>{t('shop.where', 'WHERE')}</Text>
        <PlaceButton label={mode === 'shop' ? t('shop.shopPlace', 'Shop / market') : mode === 'pickup' ? t('shop.pickupPlace', 'Pickup location') : spec.start} value={h.pickup?.address} placeholder={t('petBook.chooseLoc', 'Choose a location')} onPress={h.pickPickup} />
        <NearestArrival line={spec.type} loc={h.pickup} noun="helper" />
        {spec.end ? <PlaceButton label={spec.assist ? spec.end : t('shop.bringTo', 'Bring it to')} value={h.dest?.address} placeholder={t('petBook.chooseDest', 'Choose a destination')} color={success[500]} onPress={h.pickDest} /> : null}
        {spec.assist ? (
          <>
            <Text variant="caption" weight="bold" color={ink[500]}>{spec.when ? t('assist.when', 'WHEN') : t('assist.whenOptional', 'WHEN (OPTIONAL, EMPTY FOR NOW)')}</Text>
            <SlotPicker value={when} onChange={setWhen} days={14} />
          </>
        ) : null}
        <Button label={t('petBook.seePrice', 'See the price')} variant="outline" loading={h.quoting} disabled={!h.pickup || (spec.endRequired && !h.dest) || (shopping && !named.length)} onPress={() => h.quote(payload())} fullWidth />
        <HelpingCheckout charge={h.charge} note={h.authorisationNote} surgeQuote={h.surge.quote} surgePaise={h.surge.totalPaise} tip={h.tip} onTip={h.setTip} onSite={h.setOnSite}
          itemBudgetPaise={shopping ? budget : 0} totalLabel={t('shop.fee', 'ZappyOne service fee')} />
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
  blurb: { padding: spacing.md, borderRadius: radius.large, backgroundColor: zappy[50] },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.large, borderWidth: 2, borderStyle: 'dashed', borderColor: slate[300] },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
