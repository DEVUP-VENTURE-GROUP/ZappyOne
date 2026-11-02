/**
 * One provider's storefront for a service (the website's StorefrontPage): why
 * to trust them, their plans and their own prices; a tap books them.
 */
import { PartsNote } from '@zappy/ui/components/common/PartsNote';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, BadgeCheck, ChevronDown, Clock3, ShieldCheck, Star, Store } from 'lucide-react-native';
import { useGetShopProfileQuery, useRepairVerticalsQuery, useStorefrontMenuQuery } from '@zappy/core/api';
import { loadGeoLocation, type CachedLocation } from '@zappy/core/lib/geoCache';
import { Appear, Chip, Skeleton, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PlansNear } from '../plans/PlansNear';

interface Option { brandCode: string; typeName: string; totalPaise: number; path: string }
interface Item { repairCode: string; name: string; minutes: number | null; quoted: boolean; options: Option[]; fromPaise: number }
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
export const viaKey = (key: string) => `zappy:via:${key}`;

function MenuItem({ item, onBook }: { item: Item; onBook: (o: Option) => void }) {
  const single = item.options.length === 1;
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card}>
      <Pressable onPress={() => (single ? onBook(item.options[0]) : setOpen((o) => !o))} android_ripple={RIPPLE} accessibilityRole="button" style={styles.row}>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="bold">{item.name}</Text>
          <View style={styles.inline}>
            {item.minutes ? <><Clock3 size={11} color={ink[400]} /><Text variant="caption" color={ink[500]}>about {item.minutes} min</Text></> : null}
            {item.quoted ? <Text variant="caption" color={ink[500]}>  Final price after a look</Text> : null}
          </View>
        </View>
        <View style={styles.right}>
          {!single ? <Text variant="caption" color={ink[500]}>from</Text> : null}
          <Text variant="bodySmall" weight="bold">{rupees(item.fromPaise)}</Text>
        </View>
        {single ? <View style={styles.book}><Text variant="caption" weight="bold" color="#fff">Book</Text></View> : <ChevronDown size={18} color={slate[400]} style={open ? styles.flip : undefined} />}
      </Pressable>
      {open && !single ? (
        <Appear style={styles.grid}>
          {item.options.map((o) => (
            <Pressable key={o.brandCode} onPress={() => onBook(o)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.option}>
              <Text variant="caption" weight="semibold" color={ink[700]}>{o.typeName}</Text>
              <Text variant="bodySmall" weight="bold">{rupees(o.totalPaise)}</Text>
            </Pressable>
          ))}
        </Appear>
      ) : null}
    </View>
  );
}

export function StorefrontPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ kind: string; id: string; service?: string; via?: string; name?: string; arrival?: string }>();
  const kind = String(p.kind); const id = String(p.id);
  const [loc, setLoc] = useState<CachedLocation | null>(null);
  const [picked, setPicked] = useState(p.service ? String(p.service) : '');
  useEffect(() => { loadGeoLocation().then((l) => setLoc(l || null)); }, []);
  // Opened from the provider's own link: kept so the booking that follows counts as their customer (server shop/share-link).
  useEffect(() => { if (p.via && /^[a-z0-9]{8,24}$/.test(String(p.via))) AsyncStorage.setItem(viaKey(`${kind}:${id}`), String(p.via)).catch(() => {}); }, [p.via, kind, id]);
  const { data: shopData } = useGetShopProfileQuery(id, { skip: kind !== 'shop' });
  const { data: services } = useRepairVerticalsQuery(undefined);
  const shop = shopData?.shop;
  const offered = (services?.items || []).filter((i: { line: string }) => (shop?.services || []).some((x: { code?: string } | string) => (typeof x === 'string' ? x : x.code) === i.line));
  const vertical = picked || offered[0]?.vertical || '';
  const { data: menu, isLoading } = useStorefrontMenuQuery({ kind, id, vertical }, { skip: !vertical });
  const items: Item[] = menu?.items || [];
  const name = shop?.businessName || p.name || 'Provider';
  const rating = shop ? (shop.reviewCount ? shop.rating : null) : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));

  return (
    <View style={[styles.page, { paddingBottom: insets.bottom }]}>
      <ScrollView>
        <View style={styles.hero}>
          {shop?.coverImageUrl ? <Image source={{ uri: shop.coverImageUrl }} style={StyleSheet.absoluteFill} /> : <Store size={44} color={zappy[300]} />}
          <View style={styles.scrim} />
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={[styles.backBtn, { top: insets.top + spacing.sm }]}><ArrowLeft size={18} color={ink[900]} /></Pressable>
          <View style={styles.heroText}>
            <Text variant="caption" weight="semibold" color="rgba(255,255,255,0.85)">{offered.find((o: { vertical: string }) => o.vertical === vertical)?.name || 'Service'}</Text>
            <Text variant="pageTitle" weight="bold" color="#fff">{name}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <Appear style={styles.stats}>
            <View style={styles.stat}><Text variant="bodySmall" weight="bold">{rating != null ? `★ ${rating.toFixed(1)}` : 'New'}</Text><Text variant="caption" color={ink[500]}>{shop?.reviewCount || 0} reviews</Text></View>
            <View style={styles.stat}><Text variant="bodySmall" weight="bold">{shop?.completedJobs || 0}</Text><Text variant="caption" color={ink[500]}>jobs done</Text></View>
            <View style={styles.stat}><Text variant="bodySmall" weight="bold">{p.arrival ? `${p.arrival}m` : '-'}</Text><Text variant="caption" color={ink[500]}>to arrive</Text></View>
          </Appear>
          <View style={styles.badges}>
            <View style={styles.badge}><BadgeCheck size={12} color={zappy[700]} /><Text variant="caption" weight="semibold" color={zappy[700]}>Verified for this service</Text></View>
            <View style={styles.badge}><ShieldCheck size={12} color={ink[700]} /><Text variant="caption" weight="semibold" color={ink[700]}>Price fixed before they arrive</Text></View>
          </View>
          {shop?.bio ? <Text variant="bodySmall" color={ink[700]}>{shop.bio}</Text> : null}
          {offered.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {offered.map((o: { vertical: string; name: string }) => <Chip key={o.vertical} label={o.name} selected={o.vertical === vertical} onPress={() => setPicked(o.vertical)} />)}
            </ScrollView>
          ) : null}
          {vertical ? <PlansNear vertical={vertical} loc={loc} providerId={id} title="Their monthly plans" /> : null}
          <Text variant="sectionHeading" weight="bold">Menu</Text>
          {vertical ? <PartsNote vertical={vertical} who="customer" /> : null}
          {isLoading ? [0, 1, 2].map((k) => <Skeleton key={k} height={64} />) : null}
          {!isLoading && !items.length ? <Text variant="bodySmall" color={ink[500]}>This provider has no bookable prices for this service right now.</Text> : null}
          {items.map((item, i) => <Appear key={item.repairCode} delay={Math.min(i, 10) * 35}><MenuItem item={item} onBook={(o) => router.push(o.path as never)} /></Appear>)}
          <Text variant="caption" color={ink[500]} style={styles.center}>Anything extra on the day is sent to you in the app first, with a photo. You pay only what you approve.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  hero: { height: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[100], overflow: 'hidden' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, backgroundColor: 'rgba(0,0,0,0.4)' },
  backBtn: { position: 'absolute', left: spacing.base, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.95)' },
  heroText: { position: 'absolute', left: spacing.base, right: spacing.base, bottom: spacing.base },
  body: { gap: spacing.md, padding: spacing.base },
  stats: { flexDirection: 'row', padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chips: { gap: spacing.sm },
  card: { padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  right: { alignItems: 'flex-end' },
  book: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: zappy[600] },
  flip: { transform: [{ rotate: '180deg' }] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  option: { width: '47%', padding: spacing.sm, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border },
  center: { textAlign: 'center' },
});
