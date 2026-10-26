/**
 * Return or exchange an item (the website's ReturnTaskPage). The screen never
 * claims eligibility or promises a refund: the merchant decides, and that
 * sentence sits above the form, not in fine print.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle } from 'lucide-react-native';
import { Button, Input, ScreenHeader, Text } from '@zappy/ui/components';
import { NearestArrival } from '@zappy/ui/components/booking/NearestArrival';
import { PlaceButton } from '@zappy/ui/components/booking/PlaceButton';
import { CheckRow } from '@zappy/ui/components/common/CheckRow';
import { ImageUploadField } from '@zappy/ui/components/common/ImageUploadField';
import { toast } from '@zappy/ui/components/Toast';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { GrowingHere } from '../catalog/serviceability/GrowingHere';
import { HelpingCheckout } from './booking/HelpingCheckout';
import { ModeTiles } from './booking/ModeTiles';
import { useHelpingBooking } from './booking/useHelpingBooking';

type Mode = 'return' | 'exchange';
const METHODS: [string, string][] = [['store_dropoff', 'Take it to the store'], ['courier_dropoff', 'Drop at a courier point'], ['merchant_handover', "Follow the merchant's instructions"]];
const EMPTY = { merchantName: '', orderId: '', returnId: '', productName: '', quantity: 1, returnReason: '', returnMethod: 'store_dropoff', merchantInstructions: '', desiredReplacement: '', customerConfirmedEligibility: false, packagingConfirmed: false };

export function ReturnTaskPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'exchange' ? 'exchange' : 'return');
  const [form, setForm] = useState(EMPTY);
  const [invoiceKey, setInvoiceKey] = useState('');
  const h = useHelpingBooking({ serviceType: mode, coverageLine: 'returns_exchange' });
  const set = <K extends keyof typeof EMPTY>(k: K) => (v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const exchange = mode === 'exchange';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/helping' as never));

  async function request() {
    if (!h.pickup) { toast.error(t('ret.where', 'Where should we collect the item?')); return; }
    if (!form.productName.trim()) { toast.error(t('ret.product', 'What product is this?')); return; }
    if (!form.customerConfirmedEligibility) { toast.error(t('ret.confirmFirst', 'Please confirm the merchant has approved this return first')); return; }
    await h.book({ title: exchange ? 'Exchange task' : 'Return task', returnDetail: { ...form, merchantInstructions: form.merchantInstructions || (invoiceKey ? `Invoice: ${invoiceKey}` : '') } });
  }

  if (h.notHere) {
    return (
      <View style={[styles.page, { paddingTop: insets.top + spacing.base, paddingHorizontal: spacing.base }]}>
        <GrowingHere service={{ code: 'returns_exchange', domainCode: 'family_assist', name: 'returns' }} lat={h.pickup?.lat} lng={h.pickup?.lng} address={h.pickup?.address || ''} onChangeLocation={() => h.setNotHere(false)} />
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={exchange ? t('ret.exTitle', 'Exchange an Item') : t('ret.title', 'Return an Item')} onBack={back} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ModeTiles<Mode> value={mode} onChange={setMode} options={[['return', t('ret.title', 'Return an Item'), '/services/helping/return.webp'], ['exchange', t('ret.exTitle', 'Exchange an Item'), '/services/helping/exchange.webp']]} />
        <View style={styles.warn}>
          <AlertTriangle size={16} color={accent[700]} />
          <Text variant="caption" color={accent[700]} style={styles.flex}>
            {exchange ? t('ret.policyEx', "ZappyOne will assist with the physical exchange task. Final acceptance and replacement availability remain subject to the merchant's own policy. We don't decide that.")
              : t('ret.policy', "ZappyOne will assist with the physical return task. Final acceptance and refund remain subject to the merchant's own policy. We don't decide that.")}
          </Text>
        </View>
        <View style={styles.card}>
          <Text variant="caption" weight="bold" color={ink[500]}>{t('ret.order', 'THE ORDER')}</Text>
          <Input value={form.merchantName} onChangeText={set('merchantName')} placeholder={t('ret.merchant', 'Merchant / store name')} />
          <View style={styles.row}>
            <View style={styles.flex}><Input value={form.orderId} onChangeText={set('orderId')} placeholder={t('ret.orderId', 'Order ID')} autoCapitalize="none" /></View>
            <View style={styles.flex}><Input value={form.returnId} onChangeText={set('returnId')} placeholder={t('ret.returnId', 'Return ID (if any)')} autoCapitalize="none" /></View>
          </View>
          <Input value={form.productName} onChangeText={set('productName')} placeholder={t('ret.productName', 'Product name')} />
          <Input value={form.returnReason} onChangeText={set('returnReason')} placeholder={exchange ? t('ret.whyEx', 'Why are you exchanging it?') : t('ret.why', 'Reason for return')} multiline multilineHeight={56} />
          {exchange ? <Input value={form.desiredReplacement} onChangeText={set('desiredReplacement')} placeholder={t('ret.instead', 'What would you like instead?')} /> : null}
          <ImageUploadField value={invoiceKey} onChange={setInvoiceKey} folder="helping/returns" label="order screenshot / invoice" />
        </View>
        {!exchange ? (
          <View style={styles.card}>
            <Text variant="caption" weight="bold" color={ink[500]}>{t('ret.how', 'HOW IS IT BEING RETURNED?')}</Text>
            {METHODS.map(([v, label]) => <CheckRow key={v} round boxed={false} checked={form.returnMethod === v} onChange={() => set('returnMethod')(v)}>{t(`ret.m.${v}`, label)}</CheckRow>)}
          </View>
        ) : null}
        <CheckRow checked={form.customerConfirmedEligibility} onChange={set('customerConfirmedEligibility')}>{t('ret.eligible', `I confirm the merchant has approved this ${mode} according to its own policy.`)}</CheckRow>
        <CheckRow checked={form.packagingConfirmed} onChange={set('packagingConfirmed')}>{t('ret.packed', 'The item is packed and ready, with tags/accessories and invoice as required.')}</CheckRow>
        <Text variant="caption" weight="bold" color={ink[500]}>{t('shop.where', 'WHERE')}</Text>
        <PlaceButton label={t('ret.collectFrom', 'Collect the item from')} value={h.pickup?.address} placeholder={t('petBook.chooseLoc', 'Choose a location')} onPress={h.pickPickup} />
        <NearestArrival line="return" loc={h.pickup} noun="helper" />
        <PlaceButton label={t('ret.dest', 'Store / courier destination (optional)')} value={h.dest?.address} placeholder={t('petBook.chooseDest', 'Choose a destination')} color={success[500]} onPress={h.pickDest} />
        <Button label={t('petBook.seePrice', 'See the price')} variant="outline" loading={h.quoting} disabled={!h.pickup} onPress={() => h.quote()} fullWidth />
        <HelpingCheckout charge={h.charge} surgeQuote={h.surge.quote} surgePaise={h.surge.totalPaise} tip={h.tip} onTip={h.setTip} onSite={h.setOnSite} totalLabel={t('common.total', 'Total')} />
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
  warn: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 2, borderColor: accent[100], backgroundColor: accent[50] },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
