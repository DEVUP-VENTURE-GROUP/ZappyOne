/**
 * Confirm a pet booking (the website's confirm step): who, what, for whom,
 * the total with any surge and tip, someone else on site, and cash. One stable
 * idempotency key so a double tap cannot book twice.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCreatePetBookingMutation } from '@zappy/core/api';
import { doorAddress } from '@zappy/core/shared/doorAddress';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { PayMethodPicker, PendingFeeNotice, SomeoneElse, TipAtCheckout } from '@zappy/ui/components/booking/Checkout';
import { SurgeLines, surgeChanged, useSurge } from '@zappy/ui/components/booking/SurgeLines';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, danger, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { PetProvider, PetQuote } from './petBookingRules';

export function PetConfirmStep({ categoryCode, serviceMode, variantName, petNames, pets, provider, quote, loc, dest, scheduledAt, checkIn, checkOut, onBooked }: {
  categoryCode: string; serviceMode: string; variantName?: string; petNames: string[]; pets: { petId: string; variantCode: string; addonCodes: string[] }[];
  provider: PetProvider; quote?: PetQuote; loc: BookingLocation; dest: BookingLocation | null; scheduledAt: Date | null; checkIn: string; checkOut: string;
  onBooked: (id: string) => void;
}) {
  const t = useT();
  const [create, { isLoading }] = useCreatePetBookingMutation();
  const idempotencyKey = useMemo(() => `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, []);
  const [onSite, setOnSite] = useState<{ name: string; phone: string } | 'incomplete' | null>(null);
  const [tip, setTip] = useState(0);
  const base = quote ? Math.max(0, (quote.totalPaise || 0) - (quote.taxPaise || 0) - (quote.platformFeePaise || 0)) : null;
  const surge = useSurge({ kind: 'pet', line: categoryCode, serviceMode, loc, basePaise: base, skip: !quote });

  async function book() {
    if (onSite === 'incomplete') { toast.error(t('book.someoneElse', 'Add their name and mobile number, or untick "for someone else".')); return; }
    try {
      const res = await create({
        ...(onSite && { onSite }), categoryCode, serviceMode, pets,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : null, checkInAt: checkIn || null, checkOutAt: checkOut || null,
        serviceLocation: { type: 'Point', coordinates: [loc.lng, loc.lat], address: doorAddress(loc) },
        destination: dest ? { type: 'Point', coordinates: [dest.lng, dest.lat], address: dest.address } : undefined,
        workerId: provider.workerId || undefined, shopId: provider.shopId || undefined,
        paymentMethod: 'cash', idempotencyKey, ...surge.bookingFields, ...(tip > 0 && { tipPaise: tip * 100 }),
      }).unwrap();
      toast.success(t('book.booked', 'Booked'));
      onBooked(res.booking._id);
    } catch (err) {
      if (surgeChanged(err, surge.refetch)) { toast((err as { data: { error: string } }).data.error); return; }
      toast.error(errText(err, t('book.failed', 'Could not create the booking. Try again.')));
    }
  }

  return (
    <View style={styles.gap}>
      <View style={styles.card}>
        <Text variant="bodySmall" weight="black">{provider.name}</Text>
        <Text variant="caption" color={ink[500]}>{[variantName, petNames.join(', ')].filter(Boolean).join(', ')}</Text>
      </View>
      {quote ? (
        <View style={[styles.card, styles.total]}>
          <View style={styles.line}><Text variant="bodySmall" weight="black">{t('common.total', 'Total')}</Text><Text variant="bodySmall" weight="black">{formatPaise(quote.totalPaise + surge.totalPaise + tip * 100)}</Text></View>
          <SurgeLines quote={surge.quote} />
          {tip > 0 ? <View style={styles.line}><Text variant="caption" weight="semibold" color={danger[600]}>{t('book.tip', 'Tip for your pro')}</Text><Text variant="caption" weight="semibold" color={danger[600]}>+₹{tip}</Text></View> : null}
        </View>
      ) : null}
      {quote ? <TipAtCheckout value={tip} onChange={setTip} /> : null}
      <SomeoneElse onChange={setOnSite} />
      <PendingFeeNotice />
      <PayMethodPicker />
      <Button label={isLoading ? t('book.booking', 'Booking…') : t('book.confirm', 'Confirm booking')} variant="secondary" loading={isLoading} onPress={book} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  total: { borderColor: zappy[100], backgroundColor: zappy[50] },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
});
