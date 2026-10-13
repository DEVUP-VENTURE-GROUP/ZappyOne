/**
 * Checkout for several vehicles or devices in one visit (the website's
 * GroupCheckout; server repair/services/group): who can do them all (cheapest
 * first) or, when nobody can, which pro does which; the items with their
 * prices; one visit and service fee; any multi-item discount; then Book.
 * Prices come from the server.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Star, Users, X } from 'lucide-react-native';
import { useCreateRepairGroupMutation, useQuoteRepairGroupMutation } from '@zappy/core/api';
import { doorAddress } from '@zappy/core/shared/doorAddress';
import { formatPaise } from '@zappy/core/shared/money';
import { choiceOf } from '@zappy/core/shared/repairBasket';
import { Button, LoadingState, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { accent, colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { flow } from '../flow/FlowChrome';
import { GroupLine } from './GroupLine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function GroupCheckout({ items, shown, location, serviceMode, scheduledAt, slotLabel, onRemove, onBooked }: {
  items: Any[]; shown: Any[]; location: BookingLocation | null; serviceMode: string; scheduledAt: Date | null; slotLabel: string;
  onRemove: (i: number) => void; onBooked: (group: { _id: string }) => void;
}) {
  const [quote, { data, isLoading, error }] = useQuoteRepairGroupMutation();
  const [create, { isLoading: booking }] = useCreateRepairGroupMutation();
  const [picked, setPicked] = useState<Any>(null);
  const idempotencyKey = useMemo(() => `app-grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, []);
  const where = location ? { address: doorAddress(location) || 'Current location', coordinates: [location.lng, location.lat] } : null;
  const key = JSON.stringify({ items, serviceMode, scheduledAt, where });

  useEffect(() => {
    if (!where || items.length < 2) return;
    setPicked(null);
    quote({ items, location: where, serviceMode, scheduledAt: scheduledAt?.toISOString() ?? null }).unwrap().catch(() => {});
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const options: Any[] = data?.options?.length ? data.options : data?.split ? [data.split] : [];
  const chosen = picked || options[0] || null;

  async function book() {
    try {
      const res = await create({
        items, location: where, serviceMode, scheduledAt: scheduledAt?.toISOString() ?? null, slotLabel,
        paymentMethod: 'cash', choice: choiceOf(chosen), idempotencyKey,
      }).unwrap();
      onBooked(res.group);
    } catch (err) { toast.error(errText(err, 'Could not book these together. Try again.')); }
  }

  if (!where) return <View style={flow.card}><Text variant="bodySmall" color={ink[500]}>Pick the address first.</Text></View>;
  return (
    <View style={styles.gap}>
      <View style={flow.card}>
        <Text variant="caption" weight="bold" color={ink[500]}>IN THIS VISIT</Text>
        {shown.map((it, i) => (
          <View key={`${it.vertical}-${it.modelCode}-${it.repairCode}-${i}`} style={styles.item}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="bold" numberOfLines={1}>{it.show?.title}</Text>
              <Text variant="caption" color={ink[500]} numberOfLines={1}>{it.show?.service}</Text>
            </View>
            {chosen?.lines?.[i] ? <Text variant="bodySmall" weight="bold">{formatPaise(chosen.lines[i].pricePaise)}</Text> : null}
            {i < shown.length - 1 ? <Pressable onPress={() => onRemove(i)} accessibilityRole="button" accessibilityLabel="Remove" hitSlop={8}><X size={14} color={ink[400]} /></Pressable> : null}
          </View>
        ))}
      </View>

      {isLoading ? <LoadingState /> : error || (data && !options.length) ? (
        <View style={flow.card}><Text variant="bodySmall" color={ink[700]}>Nobody nearby can do {data?.unavailable?.length ? 'one of these' : 'these'} right now. Remove an item, or book them separately.</Text></View>
      ) : (
        <>
          {options.length ? (
            <View style={flow.card}>
              <Text variant="caption" weight="bold" color={ink[500]}>{options[0].plan === 'split' ? 'TWO PROS WILL COME' : 'ONE PRO FOR EVERYTHING'}</Text>
              {options.map((o) => {
                const on = choiceOf(o) === choiceOf(chosen);
                const who = o.plan === 'split' ? [...new Set(o.providers.map((p: Any) => p.name))].join(' + ') : o.provider.name;
                return (
                  <Pressable key={choiceOf(o)} onPress={() => setPicked(o)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.option, on && styles.on]}>
                    <View style={styles.flex}>
                      <View style={styles.row}>{o.plan === 'split' ? <Users size={14} color={ink[700]} /> : null}<Text variant="bodySmall" weight="bold" numberOfLines={1}>{who}</Text></View>
                      {o.provider?.rating != null ? <View style={styles.row}><Star size={11} color={accent[500]} fill={accent[500]} /><Text variant="caption" color={ink[500]}>{Number(o.provider.rating).toFixed(1)}</Text></View> : null}
                    </View>
                    <Text variant="body" weight="black">{formatPaise(o.totals.totalPaise)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {chosen ? (
            <View style={flow.card}>
              <GroupLine label={`${shown.length} items`} paise={chosen.totals.itemsPaise} />
              {chosen.totals.discountPaise > 0 ? <GroupLine label="Multi-item discount" paise={-chosen.totals.discountPaise} green /> : null}
              {chosen.totals.journeyPaise + chosen.totals.platformFeePaise > 0 ? <GroupLine label="Visit & service fee (once)" paise={chosen.totals.journeyPaise + chosen.totals.platformFeePaise} /> : null}
              {chosen.totals.taxPaise > 0 ? <GroupLine label="Taxes" paise={chosen.totals.taxPaise} /> : null}
              <View style={styles.total}><Text variant="bodySmall" weight="bold">Total</Text><Text variant="heading2" weight="black">{formatPaise(chosen.totals.totalPaise)}</Text></View>
              <Text variant="caption" color={ink[500]}>Pay in cash when the work is done. Each item keeps its own warranty and report.</Text>
              <Button label={`Book ${shown.length} items`} loading={booking} onPress={book} fullWidth size="large" />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border },
  on: { borderColor: zappy[500], backgroundColor: zappy[50] },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
});
