/**
 * Where (and for a stay, which dates; for transport, the destination), then
 * the price and the providers (the website's location step).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Button, Text } from '@zappy/ui/components';
import { DateStrip } from '@zappy/ui/components/booking/DateStrip';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PetQuoteCard } from './PetQuoteCard';
import type { PetQuote } from './petBookingRules';

function Place({ label, value, placeholder, color, onPress }: { label: string; value?: string; placeholder: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.card, styles.row]}>
      <MapPin size={18} color={color} />
      <View style={styles.flex}>
        <Text variant="caption" color={ink[400]}>{label}</Text>
        <Text variant="bodySmall" weight="bold" numberOfLines={1}>{value || placeholder}</Text>
      </View>
    </Pressable>
  );
}

export function PetLocationStep({ stay, transport, checkIn, checkOut, onCheckIn, onCheckOut, loc, dest, onPickLoc, onPickDest, quote, names, quoting, onQuote, searching, onFind }: {
  stay: boolean; transport: boolean; checkIn: string; checkOut: string; onCheckIn: (d: string) => void; onCheckOut: (d: string) => void;
  loc: BookingLocation | null; dest: BookingLocation | null; onPickLoc: () => void; onPickDest: () => void;
  quote?: PetQuote; names: string[]; quoting: boolean; onQuote: () => void; searching: boolean; onFind: () => void;
}) {
  const t = useT();
  const datesMissing = stay && (!checkIn || !checkOut);
  return (
    <View style={styles.gap}>
      {stay ? (
        <View style={[styles.card, styles.gap]}>
          <Text variant="caption" weight="bold" color={ink[500]}>{t('petBook.checkIn', 'CHECK-IN')}</Text>
          <DateStrip value={checkIn} onChange={(d) => { onCheckIn(d); if (checkOut && checkOut <= d) onCheckOut(''); }} />
          <Text variant="caption" weight="bold" color={ink[500]}>{t('petBook.checkOut', 'CHECK-OUT')}</Text>
          <DateStrip value={checkOut} onChange={onCheckOut} min={checkIn || undefined} />
        </View>
      ) : null}
      <Place label={t('petBook.where', 'Where')} value={loc?.address} placeholder={t('petBook.chooseLoc', 'Choose a location')} color={zappy[500]} onPress={onPickLoc} />
      {transport ? <Place label={t('petBook.destination', 'Destination')} value={dest?.address} placeholder={t('petBook.chooseDest', 'Choose a destination')} color={success[500]} onPress={onPickDest} /> : null}
      <Button label={t('petBook.seePrice', 'See the price')} variant="outline" loading={quoting} disabled={!loc || datesMissing} onPress={onQuote} fullWidth />
      {quote ? <PetQuoteCard quote={quote} names={names} /> : null}
      <Button label={searching ? t('petBook.finding', 'Finding providers…') : t('petBook.find', 'Find a provider')} variant="secondary" loading={searching} disabled={!loc || datesMissing} onPress={onFind} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  card: { padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
});
