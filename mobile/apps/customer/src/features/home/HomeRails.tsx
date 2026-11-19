// The sections of Home below the hero (the website's HomeRails); each shows only what real data backs.
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, CheckCircle2, ChevronRight, Clock, MapPin, RotateCcw, ShieldCheck, Star, Store, Wrench, XCircle } from 'lucide-react-native';
import { useGetAvailablePromosQuery, useNearbyShopsQuery } from '@zappy/core/api';
import { AREA_PHOTO } from '@zappy/core/shared/homepageContent';
import { offerEnds, offerHeadline, offerTerms } from '@zappy/core/shared/season';
import { artFor, servicePhoto } from '@zappy/core/shared/serviceArt';
import { icon3dFor } from '@zappy/core/shared/icons3d';
import { Skeleton, Text } from '@zappy/ui/components';
import { GlassSurface } from '@zappy/ui/components/Glass';
import { toast } from '@zappy/ui/components/Toast';
import { webAsset } from '@zappy/ui/lib/media';
import { artSource } from '../../lib/art';
import { accent, colors, ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HomeService } from './homeCatalog';
import { PromoBanner, type HomeAd } from './PromoBanner';
import { tintFor } from './ServiceGrid';
import { StorefrontArt } from './StorefrontArt';

const fmtDay = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

export function SectionTitle({ title, action, onAction }: { title: string; action?: string | null; onAction?: () => void }) {
  return (
    <View style={styles.title}>
      <Text variant="heading3" weight="bold" style={styles.flex}>{title}</Text>
      {action ? <Pressable onPress={onAction} hitSlop={8} style={styles.row}><Text variant="caption" weight="semibold" color={zappy[600]}>{action}</Text><ChevronRight size={15} color={zappy[600]} /></Pressable> : null}
    </View>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{children}</ScrollView>;
}

export function ModeSwitch({ onStores }: { onStores: () => void }) {
  return (
    <GlassSurface style={styles.modeShape} fallbackStyle={styles.mode} accessibilityRole="tablist">
      <View style={[styles.modeBtn, styles.modeOn]} accessibilityRole="tab" accessibilityState={{ selected: true }}>
        <Wrench size={17} color="#fff" /><Text variant="bodySmall" weight="bold" color="#fff">Book a service</Text>
      </View>
      <Pressable onPress={onStores} style={styles.modeBtn} accessibilityRole="tab" accessibilityState={{ selected: false }}>
        <Store size={17} color={zappy[700]} /><Text variant="bodySmall" weight="bold" color={zappy[700]}>Shop from Stores</Text>
        <View style={styles.newBadge}><Text variant="caption" weight="bold" color="#fff">New</Text></View>
      </Pressable>
    </GlassSurface>
  );
}

export function ZappyOnePromo({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={styles.promo}>
      <StorefrontArt width={120} />
      <View style={styles.flex}>
        <Text variant="bodyLarge" weight="bold">Discover local stores on ZappyOne</Text>
        <Text variant="caption" color={ink[500]}>Verified neighbourhood shops near you. Walk in, or book their service directly.</Text>
        <Pressable onPress={onExplore} accessibilityRole="button" style={styles.promoBtn}>
          <Text variant="caption" weight="semibold" color="#fff">Explore stores</Text><ArrowRight size={15} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const photoFor = (s: HomeService) => servicePhoto(s) || (AREA_PHOTO as Record<string, string>)[s.code] || (AREA_PHOTO as Record<string, string>)[s.domainCode] || artFor(s.code, s.domainCode)?.still || null;

function PopularCard({ s, onOpen }: { s: HomeService & { isPopular?: boolean }; onOpen: () => void }) {
  // The copy shipped in the app first (bundledArt), as Explore services does; the website only for pictures not bundled.
  const photo = artSource(photoFor(s));
  const tint = tintFor(s.domainCode);
  const covers = s.coverage?.reduce((n, g) => n + (g.problems?.length || 0), 0) || 0;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={s.name} style={styles.card}>
      <View style={[styles.cardArt, { backgroundColor: tint.bg }]}>
        {photo ? <Image source={photo} style={styles.fill} resizeMode="cover" />
          : <Image source={{ uri: webAsset(icon3dFor(s)) || undefined }} style={styles.icon3d} resizeMode="contain" />}
        {s.isPopular ? <View style={styles.pill}><Text variant="caption" weight="bold" color={accent[700]}>Popular</Text></View> : null}
      </View>
      <View style={styles.cardBody}>
        <Text variant="bodySmall" weight="bold" numberOfLines={1}>{s.name}</Text>
        {s.tagline || s.description ? <Text variant="caption" color={ink[500]} numberOfLines={2}>{s.tagline || s.description}</Text> : null}
        <View style={styles.row}>
          {s.available === true ? <><CheckCircle2 size={13} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}> Available here</Text></> : null}
          {s.available === false ? <Text variant="caption" weight="semibold" color={ink[400]}>Coming to your area</Text> : null}
          {covers > 0 ? <Text variant="caption" weight="semibold" color={ink[500]}>  {covers} problems covered</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

export function PopularServices({ services, onOpen, onViewAll }: { services: HomeService[]; onOpen: (s: HomeService) => void; onViewAll: () => void }) {
  if (!services.length) return null;
  return (
    <View style={styles.section}>
      <SectionTitle title="Popular services near you" action="View all" onAction={onViewAll} />
      <Rail>{services.map((s) => <PopularCard key={s.code} s={s} onOpen={() => onOpen(s)} />)}</Rail>
    </View>
  );
}

export function CampaignBanners({ ads, width, onOpen, onImageError }: { ads: HomeAd[]; width: number; onOpen: (ad: HomeAd) => void; onImageError: () => void }) {
  if (!ads.length) return null;
  if (ads.length === 1) return <PromoBanner ad={ads[0]} variant="campaign" onOpen={onOpen} onImageError={onImageError} />;
  return <Rail>{ads.map((ad) => <PromoBanner key={ad._id} ad={ad} variant="campaign" width={width * 0.88} onOpen={onOpen} onImageError={onImageError} />)}</Rail>;
}

interface Shop { _id: string; businessName: string; category?: string; coverImageUrl?: string; rating?: number; reviewCount?: number; services?: { name: string }[]; openNow?: boolean | null; todayHours?: { closesAt?: string }; completedJobs?: number }

function StoreCard({ shop, onOpen }: { shop: Shop; onOpen: () => void }) {
  const services = (shop.services || []).map((x) => x.name).join(' · ') || shop.category;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={shop.businessName} style={styles.card}>
      <View style={[styles.cardArt, { backgroundColor: colors.background }]}>
        {shop.coverImageUrl ? <Image source={{ uri: shop.coverImageUrl }} style={styles.fill} resizeMode="cover" /> : <Store size={30} color={ink[300]} strokeWidth={1.5} />}
        {/* Only verified shops come back from /shops/nearby, so the badge is a fact. */}
        <View style={[styles.pill, styles.row]}><ShieldCheck size={12} color={success[700]} /><Text variant="caption" weight="bold" color={success[700]}> Verified</Text></View>
      </View>
      <View style={styles.cardBody}>
        <Text variant="bodySmall" weight="bold" numberOfLines={1}>{shop.businessName}</Text>
        {(shop.reviewCount || 0) > 0 ? (
          <View style={styles.row}><Star size={13} color={accent[500]} fill={accent[500]} /><Text variant="caption" weight="semibold"> {Number(shop.rating).toFixed(1)}</Text><Text variant="caption" color={ink[400]}> ({shop.reviewCount})</Text></View>
        ) : null}
        {services ? <Text variant="caption" color={ink[500]} numberOfLines={2}>{services}</Text> : null}
        {shop.openNow === true ? <Text variant="caption" weight="semibold" color={success[700]}>Open now{shop.todayHours?.closesAt ? ` · till ${shop.todayHours.closesAt}` : ''}</Text> : null}
        {shop.openNow === false ? <Text variant="caption" weight="semibold" color={ink[400]}>Closed now</Text> : null}
      </View>
    </Pressable>
  );
}

export function LocalStores({ lat, lng, enabled, onOpenShop, onViewAll }: { lat?: number | null; lng?: number | null; enabled: boolean; onOpenShop: (id: string) => void; onViewAll: () => void }) {
  const skip = !enabled || lat == null || lng == null;
  const { data, isLoading, isError } = useNearbyShopsQuery({ lat, lng, radiusKm: 10 }, { skip });
  if (skip || isError) return null;
  const shops: Shop[] = (data?.shops || []).slice(0, 8);
  let body = <Rail>{shops.map((s) => <StoreCard key={s._id} shop={s} onOpen={() => onOpenShop(s._id)} />)}</Rail>;
  if (isLoading) body = <Rail>{[0, 1, 2].map((i) => <Skeleton key={i} width={230} height={210} />)}</Rail>;
  else if (!shops.length) {
    body = (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}><MapPin size={18} color={zappy[600]} /></View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="semibold">No verified stores within 10 km yet</Text>
          <Text variant="caption" color={ink[500]}>New shops join every week. You can still book any service above.</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <SectionTitle title="Explore local stores on ZappyOne" action={shops.length ? 'View all' : null} onAction={onViewAll} />
      {body}
    </View>
  );
}

interface Promo { code: string; name: string; type: string; discountValue: number; maxDiscountPaise?: number; minOrderPaise?: number; alreadyUsed?: boolean; expiresAt?: string }
const COUPON_FILLS = [zappy[600], accent[600], ink[900]];

export function OffersDeals({ ads, isAuthed, onOpenAd, onViewAll, onImageError }: { ads: HomeAd[]; isAuthed: boolean; onOpenAd: (ad: HomeAd) => void; onViewAll: () => void; onImageError: () => void }) {
  const { data } = useGetAvailablePromosQuery(undefined, { skip: !isAuthed });
  const promos: Promo[] = (data?.promos || []).filter((p: Promo) => !p.alreadyUsed).slice(0, 6);
  if (!ads.length && !promos.length) return null;
  return (
    <View style={styles.section}>
      <SectionTitle title="Offers & deals for you" action={isAuthed ? 'View all' : null} onAction={onViewAll} />
      <Rail>
        {ads.map((ad) => <PromoBanner key={ad._id} ad={ad} variant="offer" width={270} onOpen={onOpenAd} onImageError={onImageError} />)}
        {promos.map((p, i) => (
          <Pressable key={p.code} onPress={() => toast(`Use code ${p.code} at checkout`)} accessibilityRole="button" accessibilityLabel={`${offerHeadline(p)}, ${p.name}. Code ${p.code}`}
            style={[styles.coupon, { backgroundColor: COUPON_FILLS[i % COUPON_FILLS.length] }]}>
            <View>
              <Text variant="caption" weight="semibold" color="#fff" numberOfLines={1}>{p.name}</Text>
              <Text variant="heading2" weight="bold" color="#fff">{offerHeadline(p).toUpperCase()}</Text>
              {offerTerms(p) || offerEnds(p) ? <Text variant="caption" color="#fff" numberOfLines={1}>{[offerTerms(p), offerEnds(p)].filter(Boolean).join(' · ')}</Text> : null}
            </View>
            <View style={styles.code}><Text variant="caption" weight="bold" color="#fff">{p.code}</Text></View>
          </Pressable>
        ))}
      </Rail>
    </View>
  );
}

export function BookAgain({ items, onViewAll }: { items: { key: string; title: string; href: string; date?: string; art?: string | null }[]; onViewAll: () => void }) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <SectionTitle title="Book again" action="View all" onAction={onViewAll} />
      {items.map(({ key, title, href, date, art }) => (
        <View key={key} style={styles.line}>
          <View style={styles.lineIcon}>{art ? <Image source={{ uri: webAsset(art) || undefined }} style={styles.fill} resizeMode="contain" /> : <RotateCcw size={18} color={zappy[600]} />}</View>
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.cap}>{title}</Text>
            <Text variant="caption" color={ink[500]}>{date ? `Last booked · ${fmtDay(date)}` : 'Booked before'}</Text>
          </View>
          <Pressable onPress={() => router.push(href as never)} accessibilityRole="button" style={styles.again}>
            <Text variant="caption" weight="semibold" color={zappy[700]}>Book again</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

interface Job { kind: string; id: string; href: string; title: string; stage?: string; active?: boolean; outcome?: string; needsYou?: boolean; createdAt?: string }
const KIND_LABEL: Record<string, string> = { order: 'Service booking', repair: 'Repair', pet: 'Pet care', helping: 'Helping task' };

function ActivityIcon({ job }: { job: Job }) {
  if (job.active) return <View style={[styles.dotIcon, { backgroundColor: zappy[50] }]}><Clock size={18} color={zappy[600]} /></View>;
  if (job.outcome === 'completed') return <View style={[styles.dotIcon, { backgroundColor: success[50] }]}><CheckCircle2 size={18} color={success[600]} /></View>;
  return <View style={[styles.dotIcon, { backgroundColor: colors.background }]}><XCircle size={18} color={ink[400]} /></View>;
}

export function RecentActivity({ jobs, onViewAll }: { jobs: Job[]; onViewAll: () => void }) {
  const router = useRouter();
  if (!jobs.length) return null;
  return (
    <View style={styles.section}>
      <SectionTitle title="Your recent activity" action="All bookings" onAction={onViewAll} />
      <View style={styles.list}>
        {jobs.map((j) => (
          <Pressable key={`${j.kind}:${j.id}`} onPress={() => router.push(j.href as never)} accessibilityRole="button" style={styles.listRow}>
            <ActivityIcon job={j} />
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.cap}>{j.title}  <Text variant="caption" color={ink[500]}>{KIND_LABEL[j.kind] || 'Booking'}</Text></Text>
              <Text variant="caption" color={ink[500]} numberOfLines={1}>{j.needsYou ? 'Needs your approval' : j.stage}{j.createdAt ? ` · ${fmtDay(j.createdAt)}` : ''}</Text>
            </View>
            <ChevronRight size={18} color={ink[300]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  fill: { width: '100%', height: '100%' },
  icon3d: { width: '45%', height: '70%' },
  section: { gap: spacing.md },
  title: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rail: { gap: spacing.md, paddingRight: spacing.base },
  modeShape: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16 },
  mode: { backgroundColor: zappy[50], borderWidth: 1, borderColor: zappy[100] },
  modeBtn: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: 12 },
  modeOn: { backgroundColor: zappy[600] },
  promo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.extraLarge, backgroundColor: zappy[50], borderWidth: 1, borderColor: zappy[100] },
  promoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 40, marginTop: spacing.sm, paddingHorizontal: spacing.base, borderRadius: radius.pill, backgroundColor: zappy[600] },
  card: { width: 230, overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardArt: { width: '100%', aspectRatio: 1.6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardBody: { gap: 4, padding: spacing.md },
  pill: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.95)' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surface },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  coupon: { width: 270, height: 132, justifyContent: 'space-between', padding: spacing.base, borderRadius: radius.large },
  code: { alignSelf: 'flex-start', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.7)', borderRadius: radius.small, paddingHorizontal: 8, paddingVertical: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  lineIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: zappy[50] },
  again: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: zappy[200] },
  list: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dotIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  newBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: accent[600] },
});
