/**
 * A job has arrived — the provider is rung, not nudged (the websites'
 * JobOfferAlert). What it is, what it pays, how far, where, whether they'd
 * front money, with a countdown bar. Pass is a real button; for an offer made
 * to them it asks why.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banknote, Briefcase, Clock, IndianRupee, MapPin, Navigation, Sparkles, Star, X } from 'lucide-react-native';
import { kmBetween } from '@zappy/core/shared/distance';
import { offerClock, DEFAULT_WINDOW_SEC, PASS_REASONS } from '@zappy/core/shared/jobOffers';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '..';
import { colors, zappy, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { openLink } from '../../lib/openLink';

export interface Offer {
  kind: string; id: string; mode: string; askReason: boolean; heading: string; title: string;
  valueLabel: string; valuePaise: number; boostPaise?: number; surgePaise?: number; travelPaise?: number; distanceKm?: number | null; groupSize?: number; cash?: boolean;
  howLabel?: string; address?: string; landmark?: string; coordinates?: number[] | null; km?: number | null;
  whenLabel?: string; frontPaise?: number; expiresAt?: string; windowSec?: number; acceptLabel?: string; broadcast?: boolean;
  customer?: { rating?: number | null; count?: number } | null;
}

/** Vibrate in a repeating pattern while the alert is up; stop when it goes. */
function useRinging(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    Vibration.vibrate([0, 300, 120, 300, 1800], true);
    return () => Vibration.cancel();
  }, [active]);
}

export function JobOfferAlert({ offer, myLocation, onAccept, onDecline, onClose, declineTitle }: {
  offer: Offer; myLocation?: number[] | null;
  onAccept: () => Promise<void>; onDecline: (reason: string) => Promise<void>;
  onClose: (why: 'expired' | 'dismissed') => void; declineTitle?: string;
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [askingReason, setAskingReason] = useState(false);
  const windowSec = offer.windowSec || DEFAULT_WINDOW_SEC;
  const expiry = useMemo(() => (offer.expiresAt ? new Date(offer.expiresAt).getTime() : Date.now() + windowSec * 1000), [offer, windowSec]);
  const [left, setLeft] = useState(() => Math.max(0, Math.round((expiry - Date.now()) / 1000)));

  useRinging(true);
  useEffect(() => {
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.round((expiry - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) onClose('expired');
    }, 1000);
    return () => clearInterval(t);
  }, [expiry, onClose]);

  const km = offer.km ?? kmBetween(myLocation, offer.coordinates);
  const pct = Math.max(0, Math.min(100, (left / windowSec) * 100));
  const urgent = left <= windowSec / 5;
  const boost = (offer.boostPaise ?? 0) > 0 ? (offer.boostPaise as number) : 0;

  const act = async (which: 'accept' | 'decline', fn: () => Promise<void>) => {
    setBusy(which);
    try { await fn(); } finally { setBusy(null); }
  };
  const pass = (reason: string) => act('decline', () => onDecline(reason));
  const directions = () => {
    const [lng, lat] = offer.coordinates || [];
    openLink(lat && lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(offer.address || '')}`, 'Could not open maps on this phone.');
  };

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={() => onClose('dismissed')}>
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]} accessibilityRole="alert" accessibilityLabel={offer.heading}>
          <View style={styles.barBg}><View style={[styles.bar, { width: `${pct}%`, backgroundColor: urgent ? danger[500] : success[500] }]} /></View>

          {boost > 0 ? (
            <View style={styles.boost}>
              <View style={styles.inline}><Sparkles size={16} color={accent[700]} />
                <Text variant="bodySmall" weight="extrabold" color={accent[700]}>Customer raised the offer by {formatPaise(boost)}</Text></View>
              <Text variant="caption" weight="semibold" color={accent[700]}>All of it is yours on top of the job price. Take it before someone else does.</Text>
            </View>
          ) : null}

          <View style={styles.body}>
            <View style={styles.head}>
              <View style={styles.flex}>
                <Text variant="caption" weight="semibold" color={zappy[700]}>{offer.heading}</Text>
                <Text variant="heading2" weight="bold" numberOfLines={1} style={styles.capitalize}>{offer.title}</Text>
              </View>
              <View style={[styles.clock, { backgroundColor: urgent ? danger[50] : slate[100] }]}>
                <Text variant="caption" weight="bold" color={urgent ? danger[600] : ink[700]} accessibilityLabel={`${Math.ceil(left / 60)} minutes left`}>{offerClock(left)}</Text>
              </View>
            </View>

            <View style={styles.grid}>
              <View style={[styles.tile, boost ? styles.tileBoost : null]}>
                <View style={styles.inline}><IndianRupee size={11} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[500]}>{offer.valueLabel}</Text></View>
                <Text variant="heading2" weight="bold">{formatPaise(offer.valuePaise)}</Text>
                {(offer.groupSize ?? 1) > 1 ? <Text variant="caption" weight="bold" color={zappy[700]}>1 of {offer.groupSize} items at this visit · your answer covers all</Text> : null}
                {(offer.travelPaise ?? 0) > 0 ? <Text variant="caption" weight="semibold" color={success[700]}>incl. +{formatPaise(offer.travelPaise)} travel{offer.distanceKm != null ? ` (${Math.round(offer.distanceKm * 10) / 10} km)` : ''}, yours</Text> : null}
                {(offer.surgePaise ?? 0) > 0 ? <Text variant="caption" weight="semibold" color={accent[600]}>incl. +{formatPaise(offer.surgePaise)} surge, yours</Text> : null}
                {boost > 0 ? <Text variant="caption" weight="semibold" color={accent[700]}>{formatPaise(offer.valuePaise - boost)} + {formatPaise(boost)} extra</Text> : null}
                {offer.cash ? <View style={styles.inline}><Banknote size={11} color={success[700]} /><Text variant="caption" weight="medium" color={success[700]}>Collect in cash</Text></View> : null}
              </View>
              <View style={styles.tile}>
                <View style={styles.inline}><Briefcase size={11} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[500]}>How</Text></View>
                <Text variant="body" weight="semibold" style={styles.capitalize}>{offer.howLabel}</Text>
                {km != null ? <Text variant="caption" color={ink[500]}>{Number(km).toFixed(1)} km away</Text> : null}
              </View>
            </View>

            <Pressable onPress={directions} accessibilityRole="link" accessibilityLabel="Open directions" style={styles.address}>
              <MapPin size={15} color={zappy[500]} />
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="medium">{offer.address || 'Address shared after accepting'}</Text>
                {offer.landmark ? <Text variant="caption" color={ink[500]}>{offer.landmark}</Text> : null}
              </View>
              <Navigation size={15} color={zappy[500]} />
            </Pressable>

            {offer.customer ? (
              <View style={styles.inline}>
                <Star size={12} color={offer.customer.rating != null ? accent[500] : ink[400]} fill={offer.customer.rating != null ? accent[500] : 'none'} />
                <Text variant="caption" weight="medium" color={offer.customer.rating != null && offer.customer.rating < 3 ? danger[600] : ink[700]}>
                  {offer.customer.rating != null ? `Customer rated ${Number(offer.customer.rating).toFixed(1)} by ${offer.customer.count} provider${offer.customer.count === 1 ? '' : 's'}` : 'New customer'}
                </Text>
              </View>
            ) : null}
            {offer.whenLabel ? <View style={styles.inline}><Clock size={12} color={ink[700]} /><Text variant="caption" weight="medium" color={ink[700]}>{offer.whenLabel}</Text></View> : null}
            {(offer.frontPaise ?? 0) > 0 ? (
              <View style={styles.front}><Banknote size={13} color={accent[700]} />
                <Text variant="caption" weight="medium" color={accent[700]} style={styles.flex}>You pay {formatPaise(offer.frontPaise)} at the shop; repaid against the receipt</Text></View>
            ) : null}

            {askingReason ? (
              <View style={styles.reasons}>
                <Text variant="bodySmall" weight="bold">{declineTitle || 'Why are you passing this job?'}</Text>
                <View style={styles.reasonWrap}>
                  {PASS_REASONS.map((r: string) => (
                    <Pressable key={r} disabled={!!busy} onPress={() => pass(r)} accessibilityRole="button" style={styles.reason}>
                      <Text variant="caption" weight="semibold" color={ink[700]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => setAskingReason(false)} disabled={!!busy} hitSlop={8}>
                  <Text variant="caption" weight="semibold" color={ink[400]}>Back</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.actions}>
                <Button label="Pass" variant="outline" loading={busy === 'decline'} disabled={!!busy}
                  onPress={() => (offer.askReason ? setAskingReason(true) : pass(''))} />
                <Button label={offer.acceptLabel || 'Accept job'} variant="success" loading={busy === 'accept'} disabled={!!busy}
                  onPress={() => act('accept', onAccept)} style={styles.flex} size="large" />
              </View>
            )}
          </View>

          <Pressable onPress={() => onClose('dismissed')} accessibilityRole="button" style={styles.hide}>
            <X size={12} color={ink[500]} /><Text variant="caption" weight="medium" color={ink[500]}>Hide — it stays on your Work page</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  capitalize: { textTransform: 'capitalize' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.7)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.extraLarge, borderTopRightRadius: radius.extraLarge, overflow: 'hidden' },
  barBg: { height: 6, backgroundColor: slate[100] },
  bar: { height: 6 },
  boost: { backgroundColor: accent[100], paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 2 },
  body: { padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  clock: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  grid: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, backgroundColor: slate[50], borderRadius: radius.medium, padding: spacing.md, gap: 2 },
  tileBoost: { backgroundColor: accent[50], borderWidth: 2, borderColor: accent[500] },
  address: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.medium, padding: spacing.md },
  front: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: accent[50], borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  reasons: { gap: spacing.sm },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reason: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 36, justifyContent: 'center' },
  hide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderTopWidth: 1, borderTopColor: slate[100], minHeight: 44 },
});
