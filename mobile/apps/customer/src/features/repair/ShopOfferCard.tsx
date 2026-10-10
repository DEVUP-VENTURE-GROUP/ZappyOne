/** One shop's answer to a price request: rating, distance, part grade, warranty, note, and the price to book. */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MapPin, ShieldCheck, Star, Store } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '@zappy/ui/components';
import { accent, colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const GRADE: Record<string, string> = { oem: 'Original part', premium: 'Premium part', standard: 'Standard part' };

export interface ShopOffer {
  shopId: string; name: string; rating?: number; distanceKm?: number; warrantyDays?: number; totalPaise?: number;
  offer?: { qualityCode?: string; warrantyDays?: number; totalPaise?: number; note?: string };
}

export const ShopOfferCard = memo(function ShopOfferCard({ p, open, confirming, booking, onChoose }: { p: ShopOffer; open: boolean; confirming: boolean; booking: boolean; onChoose: () => void }) {
  const price = p.offer?.totalPaise ?? p.totalPaise ?? 0;
  const warranty = p.offer?.warrantyDays || p.warrantyDays || 0;
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.icon}><Store size={18} color={ink[500]} /></View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="bold" numberOfLines={1}>{p.name}</Text>
          <View style={styles.meta}>
            {p.rating ? <View style={styles.inline}><Star size={11} color={accent[500]} /><Text variant="caption" color={ink[500]}>{Number(p.rating).toFixed(1)}</Text></View> : <Text variant="caption" color={ink[500]}>New</Text>}
            {p.distanceKm != null ? <View style={styles.inline}><MapPin size={11} color={ink[500]} /><Text variant="caption" color={ink[500]}>{Number(p.distanceKm).toFixed(1)} km</Text></View> : null}
            {p.offer?.qualityCode ? <Text variant="caption" color={ink[500]}>{GRADE[p.offer.qualityCode] || p.offer.qualityCode}</Text> : null}
            {warranty > 0 ? <View style={styles.inline}><ShieldCheck size={11} color={ink[500]} /><Text variant="caption" color={ink[500]}>{warranty}-day warranty</Text></View> : null}
          </View>
          {p.offer?.note ? <Text variant="caption" color={ink[700]}>“{p.offer.note}”</Text> : null}
        </View>
        <Text variant="body" weight="black">{formatPaise(price)}</Text>
      </View>
      {open ? <Button label={confirming ? `Confirm booking with ${p.name}` : `Book for ${formatPaise(price)}`} variant={confirming ? 'success' : 'primary'}
        loading={booking && confirming} disabled={booking} onPress={onChoose} fullWidth /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  flex: { flex: 1, minWidth: 0 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2, marginTop: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
