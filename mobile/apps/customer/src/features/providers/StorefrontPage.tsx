/**
 * One provider's storefront for a service (the website's StorefrontPage): who
 * they are, why to trust them, their own prices and reviews; a tap books them.
 */
import { PartsNote } from '@zappy/ui/components/common/PartsNote';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, BadgeCheck, BadgeIndianRupee, ChevronDown, Clock3, Share2, ShieldCheck, Star, ThumbsUp } from 'lucide-react-native';
import { useGetShopProfileQuery, useGetWorkerPublicProfileQuery, useRepairVerticalsQuery, useStorefrontMenuQuery } from '@zappy/core/api';
import { loadGeoLocation, type CachedLocation } from '@zappy/core/lib/geoCache';
import { Appear, Chip, Skeleton, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PlansNear } from '../plans/PlansNear';

interface Option { brandCode: string; typeName: string; totalPaise: number; path: string }
interface Item { repairCode: string; name: string; minutes: number | null; quoted: boolean; options: Option[]; fromPaise: number }
interface Review { rating: number; text?: string; at?: string }
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
const monthYear = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
export const viaKey = (key: string) => `zappy:via:${key}`;

// The pro's photo when there is one, else their initials: Ravi Kumar → RK.
function Avatar({ name, photo }: { name: string; photo: string | null }) {
  if (photo) return <Image source={{ uri: photo }} style={styles.avatar} />;
  const words = (name || 'Pro').trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
  return <View style={[styles.avatar, styles.initials]}><Text variant="heading1" weight="extrabold" color={zappy[700]}>{initials}</Text></View>;
}

function MenuItem({ item, onBook }: { item: Item; onBook: (o: Option) => void }) {
  const single = item.options.length === 1;
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.menuRow}>
      <Pressable onPress={() => (single ? onBook(item.options[0]) : setOpen((o) => !o))} android_ripple={RIPPLE} accessibilityRole="button" style={styles.row}>
        <View style={styles.flex}>
          <Text variant="body" weight="bold">{item.name}</Text>
          <View style={styles.inline}>
            <Text variant="bodySmall" weight="semibold">{single ? '' : 'from '}{rupees(item.fromPaise)}</Text>
            {item.minutes ? <><Clock3 size={13} color={ink[500]} /><Text variant="bodySmall" color={ink[500]}>about {item.minutes} min</Text></> : null}
            {item.quoted ? <Text variant="bodySmall" color={ink[500]}>Final price after a look</Text> : null}
          </View>
        </View>
        {single
          ? <View style={styles.book}><Text variant="bodySmall" weight="bold" color={zappy[700]}>Book</Text></View>
          : <View style={styles.more}><Text variant="bodySmall" weight="semibold" color={ink[700]}>{item.options.length} options</Text><ChevronDown size={15} color={ink[700]} style={open ? styles.flip : undefined} /></View>}
      </Pressable>
      {open && !single ? (
        <Appear style={styles.grid}>
          {item.options.map((o) => (
            <Pressable key={o.brandCode} onPress={() => onBook(o)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.option}>
              <Text variant="bodySmall" color={ink[500]}>{o.typeName}</Text>
              <Text variant="body" weight="bold">{rupees(o.totalPaise)}</Text>
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
  const { data: workerData } = useGetWorkerPublicProfileQuery(id, { skip: kind !== 'worker' });
  const { data: services } = useRepairVerticalsQuery(undefined);
  const shop = shopData?.shop;
  const pro = workerData?.worker;
  const lines: string[] = shop
    ? (shop.services || []).map((x: { code?: string } | string) => (typeof x === 'string' ? x : x.code))
    : (pro?.verifiedServices || []).map((v: { code: string }) => v.code);
  const offered = (services?.items || []).filter((i: { line: string }) => lines.includes(i.line));
  const vertical = picked || offered[0]?.vertical || '';
  const { data: menu, isLoading } = useStorefrontMenuQuery({ kind, id, vertical }, { skip: !vertical });
  const items: Item[] = menu?.items || [];
  const service = (services?.items || []).find((i: { vertical: string }) => i.vertical === vertical);
  const name: string = shop?.businessName || pro?.name || p.name || 'Provider';
  const rating: number | null = shop ? (shop.reviewCount ? shop.rating : null) : pro ? pro.rating : null;
  const reviewCount: number = shop?.reviewCount ?? pro?.ratingCount ?? 0;
  const jobs: number = shop?.completedJobs ?? pro?.completedJobs ?? 0;
  const cover = shop?.coverImageUrl ? webAsset(shop.coverImageUrl) : null;
  const verified = shop ? true : pro ? !!pro.verified : true;
  const reviews: Review[] = (workerData?.reviews || []).filter((r: Review) => r.text).slice(0, 3);
  const mark = webAsset('/branding/zappy-mark.webp');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));
  const share = () => { Share.share({ message: `${name} on ZappyOne: https://zappyone.com/storefront/${kind}/${id}${vertical ? `?service=${vertical}` : ''}` }).catch(() => {}); };
  const third = p.arrival ? [`${p.arrival} min`, 'to arrive'] : pro?.acceptRate != null ? [`${pro.acceptRate}%`, 'jobs accepted'] : ['-', 'jobs accepted'];

  return (
    <View style={[styles.page, { paddingBottom: insets.bottom }]}>
      <ScrollView>
        <View style={[styles.band, { height: 150 + insets.top }]}>
          {cover ? <><Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /><View style={styles.scrim} /></>
            : mark ? <Image source={{ uri: mark }} style={styles.watermark} resizeMode="contain" /> : null}
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={[styles.round, { top: insets.top + spacing.sm, left: spacing.md }]}><ArrowLeft size={19} color={ink[900]} /></Pressable>
          <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share" style={[styles.round, { top: insets.top + spacing.sm, right: spacing.md }]}><Share2 size={17} color={ink[900]} /></Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.avatarWrap}><Avatar name={name} photo={pro?.photo ? webAsset(pro.photo) : null} /></View>
          <Text variant="heading1" weight="extrabold">{name}</Text>
          <Text variant="body" color={ink[500]}>
            {service?.name || 'Service'}{pro?.memberSince ? ` · on ZappyOne since ${monthYear(pro.memberSince)}` : ''}{shop?.address?.city ? ` · ${shop.address.city}` : ''}
          </Text>
          <View style={styles.badges}>
            {verified ? <View style={[styles.badge, { backgroundColor: zappy[50] }]}><BadgeCheck size={14} color={zappy[700]} /><Text variant="caption" weight="semibold" color={zappy[700]}>Verified</Text></View> : null}
            {pro?.neverCancels ? <View style={[styles.badge, { backgroundColor: '#ECFDF3' }]}><ThumbsUp size={13} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>Never cancels</Text></View> : null}
            {shop?.todayHours ? <View style={[styles.badge, { backgroundColor: slate[100] }]}><Clock3 size={13} color={ink[700]} /><Text variant="caption" weight="semibold" color={ink[700]}>{shop.openNow ? 'Open now' : 'Closed now'} · {shop.todayHours}</Text></View> : null}
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <View style={styles.inline}>{rating != null ? <Star size={15} color="#FBBF24" fill="#FBBF24" /> : null}<Text variant="heading3" weight="extrabold">{rating != null ? Number(rating).toFixed(1) : 'New'}</Text></View>
              <Text variant="caption" color={ink[500]}>{reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}</Text>
            </View>
            <View style={[styles.stat, styles.divider]}><Text variant="heading3" weight="extrabold">{jobs.toLocaleString('en-IN')}</Text><Text variant="caption" color={ink[500]}>jobs done</Text></View>
            <View style={[styles.stat, styles.divider]}><Text variant="heading3" weight="extrabold">{third[0]}</Text><Text variant="caption" color={ink[500]}>{third[1]}</Text></View>
          </View>
          {shop?.bio ? <Text variant="body" color={ink[700]}>{shop.bio}</Text> : null}
        </View>

        <View style={styles.section}>
          {[[ShieldCheck, 'Checked by ZappyOne', 'ID and skills verified before their first job'], [BadgeIndianRupee, 'Price agreed before work', 'Nothing extra is charged without your OK']].map(([Icon, t, sub]) => {
            const I = Icon as typeof ShieldCheck;
            return (
              <View key={t as string} style={styles.trust}>
                <View style={styles.trustIcon}><I size={19} color={ink[900]} /></View>
                <View style={styles.flex}><Text variant="body" weight="semibold">{t as string}</Text><Text variant="bodySmall" color={ink[500]}>{sub as string}</Text></View>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text variant="heading3" weight="extrabold">Their prices</Text>
          {offered.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {offered.map((o: { vertical: string; name: string }) => <Chip key={o.vertical} label={o.name} selected={o.vertical === vertical} onPress={() => setPicked(o.vertical)} />)}
            </ScrollView>
          ) : null}
          {vertical ? <PartsNote vertical={vertical} who="customer" /> : null}
          {isLoading ? [0, 1, 2].map((k) => <Skeleton key={k} height={56} />) : null}
          {!isLoading && !items.length ? <Text variant="body" color={ink[500]}>{vertical ? 'No bookable prices for this service right now.' : 'This provider has no services you can book here yet.'}</Text> : null}
          {items.map((item) => <MenuItem key={item.repairCode} item={item} onBook={(o) => router.push(o.path as never)} />)}
        </View>

        {vertical ? <View style={styles.plans}><PlansNear vertical={vertical} loc={loc} providerId={id} title="Their monthly plans" /></View> : null}

        {reviews.length ? (
          <View style={styles.section}>
            <Text variant="heading3" weight="extrabold">What customers say</Text>
            {reviews.map((r, i) => (
              <View key={i} style={[styles.review, i > 0 && styles.line]}>
                <View style={styles.reviewHead}>
                  <View style={styles.inline}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} color={n <= r.rating ? '#FBBF24' : slate[200]} fill={n <= r.rating ? '#FBBF24' : slate[200]} />)}</View>
                  {r.at ? <Text variant="caption" color={ink[400]}>{monthYear(r.at)}</Text> : null}
                </View>
                <Text variant="body">{r.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text variant="caption" color={ink[500]} style={styles.note}>Anything extra on the day is sent to you in the app first, with a photo. You pay only what you approve.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  band: { backgroundColor: zappy[700], overflow: 'hidden' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  watermark: { position: 'absolute', right: -30, top: -30, width: 220, height: 220, opacity: 0.12, tintColor: '#fff', transform: [{ rotate: '12deg' }] },
  round: { position: 'absolute', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  section: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.base, borderBottomWidth: 8, borderBottomColor: slate[100] },
  avatarWrap: { marginTop: -60, alignSelf: 'flex-start', padding: 4, borderRadius: 30, backgroundColor: '#fff' },
  avatar: { width: 96, height: 96, borderRadius: 26 },
  initials: { alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  stats: { flexDirection: 'row', marginTop: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200] },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { borderLeftWidth: 1, borderLeftColor: slate[200] },
  trust: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  trustIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  chips: { gap: spacing.sm },
  menuRow: { paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: slate[300] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  book: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.button, borderWidth: 1, borderColor: zappy[600] },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.button, borderWidth: 1, borderColor: slate[200] },
  flip: { transform: [{ rotate: '180deg' }] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  option: { width: '48%', padding: spacing.sm, borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200] },
  plans: { paddingHorizontal: spacing.base, paddingTop: spacing.base },
  review: { gap: 6, paddingVertical: spacing.md },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: slate[300] },
  note: { textAlign: 'center', padding: spacing.lg },
});
