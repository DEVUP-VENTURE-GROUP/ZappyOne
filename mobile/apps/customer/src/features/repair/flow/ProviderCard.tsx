/**
 * One provider, and what they would actually charge (the website's
 * ProviderCard): photo, arrival, rating, time, distance, jobs done, and a
 * tappable row per part grade they price, because the grade is the decision.
 */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Clock, MapPin, ShieldCheck, Star } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { freeVisit, totalOf } from '@zappy/core/shared/repairBill';
import { Text } from '@zappy/ui/components';
import { ArrivalBadge } from '@zappy/ui/components/booking/ArrivalBadge';
import { webAsset } from '@zappy/ui/lib/media';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { accent, colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { flow } from './FlowChrome';
import type { Provider } from './repairRules';

export const ProviderCard = memo(function ProviderCard({ p, recommended, serviceMode, onPick }: { p: Provider; recommended: boolean; serviceMode: string; onPick: (qualityCode: string | null) => void }) {
  const options = p.priceOptions?.length ? p.priceOptions : null;
  const img = webAsset(p.zappyPool ? '/branding/zappy-mark.webp' : p.imageUrl);
  const later = p.availableInMinutes != null ? (p.availableInMinutes >= 60 ? `${Math.round(p.availableInMinutes / 60)} hour` : `${p.availableInMinutes} min`) : '';
  return (
    <View style={[flow.card, recommended && styles.pick]}>
      <View style={styles.top}>
        <View style={styles.photo}>{img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} /> : <Text variant="body" weight="black" color={ink[400]}>{(p.name || '?')[0].toUpperCase()}</Text>}</View>
        <View style={flow.flex}>
          <View style={styles.inline}>
            <Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.shrink}>{p.name}</Text>
            {recommended ? <View style={styles.instant}><Text variant="caption" weight="black" color={zappy[700]}>INSTANT</Text></View> : null}
          </View>
          {p.zappyPool ? <Text variant="caption" color={ink[500]}>Trained and verified by ZappyOne. The nearest free pro is asked first{(p.staffCount || 0) > 1 ? `, ${p.staffCount} on duty near you` : ''}.</Text> : null}
          {p.busy ? <Text variant="caption" weight="semibold" color={accent[700]}>Finishing another job: can reach you about {later} later</Text> : null}
          {p.arrivalMinutes != null ? <ArrivalBadge minutes={p.arrivalMinutes} withinPromise={p.arrivalWithinPromise} busy={p.busy} /> : null}
          <View style={styles.meta}>
            {p.rating != null ? <View style={styles.inline}><Star size={11} color={accent[500]} fill={accent[500]} /><Text variant="caption" weight="bold" color={ink[700]}>{Number(p.rating).toFixed(1)}</Text></View> : null}
            {p.durationMinutes || p.etaMinutes ? <View style={styles.inline}><Clock size={11} color={ink[500]} /><Text variant="caption" color={ink[500]}>Repair takes ~{p.durationMinutes || p.etaMinutes} min</Text></View> : null}
            {p.distanceKm != null ? <View style={styles.inline}><MapPin size={11} color={ink[500]} /><Text variant="caption" color={ink[500]}>{p.distanceKm.toFixed(1)} km</Text></View> : null}
            {p.completedJobs ? <Text variant="caption" color={ink[500]}>{p.completedJobs} jobs done</Text> : null}
          </View>
        </View>
        {!options ? (p.totalPaise != null ? (
          <View style={styles.price}>
            <Text variant="heading3" weight="black">{formatPaise(totalOf({ pricePaise: p.totalPaise, bill: p.bill }))}</Text>
            {freeVisit(p.bill, serviceMode) ? <Text variant="caption" weight="bold" color={success[600]}>Free visit</Text> : null}
          </View>
        ) : <Text variant="caption" weight="bold" color={accent[600]}>After diagnosis</Text>) : null}
      </View>
      {options ? options.map((o) => (
        <Pressable key={o.qualityCode || 'any'} onPress={() => onPick(o.qualityCode || null)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.option}>
          <View style={flow.flex}>
            <View style={styles.inline}>
              <Text variant="caption" weight="bold">{o.label}</Text>
              {o.isGenuine ? <View style={styles.genuine}><Text variant="caption" weight="bold" color={success[700]}>GENUINE</Text></View> : null}
            </View>
            {o.warrantyDays ? <View style={styles.inline}><ShieldCheck size={10} color={success[600]} /><Text variant="caption" weight="semibold" color={success[600]}>{o.warrantyDays}-day warranty</Text></View> : null}
          </View>
          <Text variant="bodySmall" weight="black">{formatPaise(totalOf({ pricePaise: o.totalPaise, bill: o.bill }))}</Text>
          <ChevronRight size={14} color={slate[300]} />
        </Pressable>
      )) : (
        <Pressable onPress={() => onPick(null)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.option}>
          <Text variant="caption" weight="bold" color={ink[700]} style={flow.flex}>{p.warrantyDays ? `${p.warrantyDays}-day warranty` : 'Select this technician'}</Text>
          <ChevronRight size={14} color={slate[300]} />
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  price: { alignItems: 'flex-end', maxWidth: 150 },
  pick: { borderColor: zappy[200], borderWidth: 2 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  photo: { width: 44, height: 44, borderRadius: radius.medium, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shrink: { flexShrink: 1 },
  instant: { borderRadius: radius.pill, paddingHorizontal: 6, backgroundColor: zappy[100] },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 2, marginTop: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border },
  genuine: { borderRadius: radius.pill, paddingHorizontal: 6, backgroundColor: success[50] },
});
