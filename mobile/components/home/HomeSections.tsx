/**
 * Home sections — the customer Home, built to the reference design:
 *
 *   header · search · Book a Service / Shop from Stores · hero banners ·
 *   explore services · discover stores · popular services · campaign banners ·
 *   local stores · offers & deals · book again · recent activity
 *
 * Every number shown comes from the API. A section with nothing real to show
 * renders nothing (or an honest empty row) — never placeholder figures. The
 * reference's ratings / "From ₹" prices are not in the live catalogue, so
 * service cards show what the catalogue does carry instead.
 *
 * Banner artwork ships with the app (assets/banners); admin banners from
 * Homepage → Banners join the same carousels after it.
 */

import React, { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Image, Platform, ScrollView, StyleSheet, View,
  type ImageSourcePropType, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowRight, Bell, CheckCircle2, ChevronDown, ChevronRight, Clock, Flame, MapPin, Mic, ScanLine, Search,
  ShieldCheck, Star, Store, UserRound, Wrench, XCircle,
} from 'lucide-react-native';
import { GlassSurface, LIQUID_GLASS, ScalePressable, Text } from '../ui';
import type { HomeBanner, AvailablePromo } from '../../services/api/homeApi';
import type { LiveCatalogDomain, LiveCatalogService, Shop } from '../../types/api';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { brand, ink } from '../../theme/brand';
import { GradientFill, Icon3DTile, MoreGlyph, icon3d, icon3dKey, pastelFor } from './icons3d';
import { areaPhoto } from './areaPhotos';
import { servicePhoto } from './servicePhotos';
import { StorefrontArt } from './StorefrontArt';

const MARK = require('../../assets/images/zappy-mark.png');

/* Palette — sampled from the reference */
export const HOME_BG = '#F6F8FE';
const NAVY = '#14205A';
const BLUE = '#2251E0';
const LINE = '#E6E9F2';
const GREEN = '#16A34A';
const RED = '#EF4444';
/** A whisper of brand blue in the glass, for the profile disc. */
const GLASS_BLUE_TINT = 'rgba(34, 81, 224, 0.14)';

const cardShadow = Platform.select({
  ios: { shadowColor: '#1B2A6B', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  default: { elevation: 2 },
});

/** A live-catalogue service, carrying its domain and whether it is bookable here. */
export type HomeService = LiveCatalogService & { domainCode: string; available?: boolean };

/** `/shops/nearby` returns services as objects and adds today's open state. */
export type NearbyShop = Omit<Shop, 'services'> & {
  services?: ({ code: string; name: string } | string)[];
  openNow?: boolean | null;
  todayHours?: { closesAt?: string } | null;
};

/* Links */

const WEB_ORIGIN = (process.env.EXPO_PUBLIC_WEB_URL || 'https://www.zappyone.com').replace(/\/+$/, '');

/** Website paths that have a screen in this app. */
const APP_ROUTES: Record<string, string> = {
  '/services': '/(tabs)/services',
  '/nearby-shops': '/shops',
  '/orders': '/(tabs)/bookings',
  '/rewards': '/rewards',
  '/wallet': '/wallet',
  '/notifications': '/notifications',
};

/**
 * Banner destinations are written for the website (Homepage → Banners). A page
 * this app has opens natively; a page only the website has opens on the
 * website in the in-app browser; https links open as given.
 */
export function openBannerLink(push: (href: string) => void, link?: string) {
  if (!link) return;
  if (/^https:\/\//i.test(link)) { WebBrowser.openBrowserAsync(link).catch(() => {}); return; }
  if (!link.startsWith('/')) return;
  const path = link.split(/[?#]/)[0];
  if (APP_ROUTES[path]) { push(APP_ROUTES[path]); return; }
  if (/^\/shops\/[^/]+$/.test(path)) { push(path); return; }
  WebBrowser.openBrowserAsync(`${WEB_ORIGIN}${link}`).catch(() => {});
}

const fmtDay = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
const hex6 = (v: string | undefined, fallback: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);

/* Building blocks */

export function SectionHead({ title, action = 'View All', onAction, trailing, accent = false }: {
  title: string; action?: string | null; onAction?: () => void; trailing?: React.ReactNode;
  /** The reference's orange bar before the title. */
  accent?: boolean;
}) {
  return (
    <View style={s.sectionHead}>
      <View style={s.sectionTitleRow}>
        {accent ? <View style={s.sectionAccent} /> : null}
        <Text weight="bold" color={ink[900]} style={s.sectionTitle} accessibilityRole="header">{title}</Text>
        {trailing}
      </View>
      {action && onAction ? (
        <ScalePressable onPress={onAction} accessibilityRole="button" accessibilityLabel={`${action}: ${title}`} style={s.sectionAction} hitSlop={8}>
          <Text weight="semibold" color={BLUE} style={s.sectionActionText}>{action}</Text>
          <ArrowRight size={16} color={BLUE} strokeWidth={2.2} />
        </ScalePressable>
      ) : null}
    </View>
  );
}

/** "ZappyOne" set in the brand blue, as the reference's section titles use it. */
function ZappyOneWord({ size }: { size: number }) {
  return <Text weight="bold" color="#2F55E6" style={{ fontSize: size, lineHeight: Math.round(size * 1.25), letterSpacing: -0.3 }}>ZappyOne</Text>;
}

/** Header logo: the mark with "Zappy" beside it. */
export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <View style={s.wordmark} accessibilityRole="image" accessibilityLabel="Zappy">
      <Image source={MARK} style={{ height: size, width: size * (179 / 120) }} resizeMode="contain" />
      <Text weight="bold" color={NAVY} style={{ fontSize: Math.round(size * 0.86), lineHeight: Math.round(size * 1.1), letterSpacing: -0.6 }}>Zappy</Text>
    </View>
  );
}

/* Header, search, switch */

export function HomeTopBar({ location, onPickLocation, unread, onBell, onProfile }: {
  location: string | null; onPickLocation: () => void; unread: number; onBell: () => void; onProfile: () => void;
}) {
  // "Narsingi, Hyderabad, Telangana" → bold locality, regular rest.
  const [lead, ...rest] = (location ?? '').split(',');
  const tail = rest.join(',').trim();
  return (
    <View style={s.topBar}>
      <View style={s.flex}>
        <Wordmark size={30} />
        <ScalePressable onPress={onPickLocation} style={s.locationRow} accessibilityRole="button"
          accessibilityLabel={location ? `Service location: ${location}. Change location` : 'Set your location'}>
          <MapPin size={17} color="#FFFFFF" fill={BLUE} strokeWidth={2} />
          <Text numberOfLines={1} style={[s.flexShrink, s.locationText]} color={ink[700]}>
            {location ? (
              <>
                <Text weight="bold" color={ink[900]} style={s.locationText}>{lead.trim()}</Text>
                {tail ? <Text color={ink[700]} style={s.locationText}>{`, ${tail}`}</Text> : null}
              </>
            ) : <Text weight="bold" color={ink[900]} style={s.locationText}>Set your location</Text>}
          </Text>
          <ChevronDown size={17} color={NAVY} strokeWidth={2.4} />
        </ScalePressable>
      </View>
      <BellButton unread={unread} onPress={onBell} />
      <ScalePressable onPress={onProfile} style={s.roundHit} accessibilityRole="button" accessibilityLabel="Your profile">
        <GlassSurface interactive tint={GLASS_BLUE_TINT} style={s.roundBtn} fallbackStyle={[s.roundSolid, s.profileBtn]}>
          <UserRound size={22} color={BLUE} strokeWidth={2} />
        </GlassSurface>
      </ScalePressable>
    </View>
  );
}

/** Bell with the unread count; shared by the top bar and the floating glass header. */
export function BellButton({ unread, onPress, size = 50, shown = true }: {
  unread: number; onPress: () => void; size?: number;
  /** For the floating header: fades the glass via its style, the icon via opacity. */
  shown?: boolean;
}) {
  const dim = { width: size, height: size, borderRadius: size / 2 };
  return (
    <ScalePressable onPress={onPress} style={dim} accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}>
      <GlassSurface interactive animate variant={shown ? 'regular' : 'none'} style={[s.roundBtn, dim]}
        fallbackStyle={[s.roundSolid, cardShadow]}>
        <Bell size={size * 0.44} color={BLUE} strokeWidth={2} style={!shown && s.hidden} />
      </GlassSurface>
      {/* Outside the glass so the material never clips or tints it. */}
      {unread > 0 ? (
        <View style={[s.badge, !shown && s.hidden]}>
          <Text style={s.badgeText} color="#FFFFFF" weight="bold">{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </ScalePressable>
  );
}

/**
 * The compact header that floats over Home once the full top bar has scrolled
 * away (iOS 26 only): a glass capsule with the service location, and the bell.
 * `shown` animates the material in and out — never opacity on the glass.
 */
export function FloatingGlassHeader({ shown, top, location, unread, onPickLocation, onBell }: {
  shown: boolean; top: number; location: string | null; unread: number; onPickLocation: () => void; onBell: () => void;
}) {
  const lead = (location ?? '').split(',')[0].trim();
  // A sibling of the glass, never its parent, so fading it is safe.
  const edge = useAnimatedStyle(() => ({ opacity: withTiming(shown ? 1 : 0, { duration: 220 }) }), [shown]);
  return (
    <View pointerEvents={shown ? 'box-none' : 'none'} style={[s.floatWrap, { paddingTop: top }]}
      accessibilityElementsHidden={!shown} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}>
      {/* Scroll-edge effect: content softens as it slides under the status bar. */}
      <Animated.View pointerEvents="none" style={[s.edgeFade, { height: top + 72 }, edge]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="homeEdge" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={HOME_BG} stopOpacity={1} />
              <Stop offset="0.55" stopColor={HOME_BG} stopOpacity={0.9} />
              <Stop offset="1" stopColor={HOME_BG} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#homeEdge)" />
        </Svg>
      </Animated.View>
      <ScalePressable onPress={onPickLocation} style={s.flexShrink} accessibilityRole="button"
        accessibilityLabel={location ? `Service location: ${location}. Change location` : 'Set your location'}>
        <GlassSurface interactive animate variant={shown ? 'regular' : 'none'} style={s.floatPill}>
          <View style={[s.floatPillInner, !shown && s.hidden]}>
            <MapPin size={16} color="#FFFFFF" fill={BLUE} strokeWidth={2} />
            <Text weight="bold" color={ink[900]} numberOfLines={1} style={[s.flexShrink, s.locationText]}>
              {lead || 'Set your location'}
            </Text>
            <ChevronDown size={16} color={NAVY} strokeWidth={2.4} />
          </View>
        </GlassSurface>
      </ScalePressable>
      <BellButton unread={unread} onPress={onBell} size={44} shown={shown} />
    </View>
  );
}

export function SearchTrigger({ onPress }: { onPress: () => void }) {
  return (
    <ScalePressable onPress={onPress} accessibilityRole="search" accessibilityLabel="Search for services, stores, or products">
      <GlassSurface interactive style={s.search} fallbackStyle={[s.searchSolid, cardShadow]}>
        <Search size={21} color={NAVY} strokeWidth={2.2} />
        <Text color={LIQUID_GLASS ? ink[500] : ink[400]} numberOfLines={1} style={[s.flex, s.searchText]}>Search for services, stores, or products…</Text>
        <Mic size={20} color={NAVY} strokeWidth={2} />
        <View style={s.searchDivider} />
        <ScanLine size={20} color={NAVY} strokeWidth={2} />
      </GlassSurface>
    </ScalePressable>
  );
}

export function ModeSwitch({ onStores }: { onStores: () => void }) {
  return (
    <GlassSurface style={s.switch} fallbackStyle={s.switchSolid} accessibilityRole="tablist">
      <View style={s.switchActiveWrap} accessibilityRole="tab" accessibilityState={{ selected: true }}>
        <View style={[s.switchItem, s.switchActive]}>
          <GradientFill colors={['#2F62F0', '#1B3FC8']} radius={14} id="modeActive" />
          <Wrench size={19} color="#FFFFFF" strokeWidth={2.2} />
          <Text weight="bold" color="#FFFFFF" style={[s.switchText, s.switchUnderline]}>Book a Service</Text>
        </View>
        <View style={s.switchPointer} />
      </View>
      <ScalePressable onPress={onStores} style={s.switchItem} accessibilityRole="tab" accessibilityState={{ selected: false }}
        accessibilityLabel="Shop from Stores, new">
        <Store size={19} color={NAVY} strokeWidth={2.1} />
        <Text weight="bold" color={NAVY} style={s.switchText}>Shop from Stores</Text>
        <View style={s.newBadge}><Text weight="bold" color="#FFFFFF" style={s.newBadgeText}>New</Text></View>
      </ScalePressable>
    </GlassSurface>
  );
}

/* Banners */

/** Artwork bundled with the app (assets/banners). Text and buttons are part of the image. */
export interface LocalBanner {
  id: string;
  source: ImageSourcePropType;
  label: string;
  /** App route, or `#offers` to jump to the offers section. */
  link: string;
}

export const HERO_BANNERS: LocalBanner[] = [
  { id: 'every-service', source: require('../../assets/banners/every-service.jpg'), label: 'Every service. One place. Book trusted professionals for your home, lifestyle and everyday needs.', link: '/(tabs)/services?category=all' },
  { id: 'home-repairs', source: require('../../assets/banners/home-repairs.jpg'), label: 'Home repairs made easy. AC, appliance, electrical, plumbing and more. Book now.', link: '/(tabs)/services?category=home_services' },
];

export const CAMPAIGN_BANNERS: LocalBanner[] = [
  { id: 'home-cleaning', source: require('../../assets/banners/home-cleaning.jpg'), label: 'A cleaner, happier home. Professional home cleaning. Book cleaning now.', link: '/(tabs)/services?category=home_daily_help' },
  { id: 'special-offers', source: require('../../assets/banners/special-offers.jpg'), label: 'Special offers. Explore offers.', link: '#offers' },
];

/** The artwork's own aspect ratio (1599 × 899). */
const BANNER_RATIO = 899 / 1599;
const BANNER_HEIGHT = { hero: 188, campaign: 164, offer: 132 } as const;

/** A horizontal scrim drawn in SVG — legible type on any photo. */
function Scrim({ color, from = 0.95, to = 0, stopAt = 0.75 }: { color: string; from?: number; to?: number; stopAt?: number }) {
  const id = `scrim${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity={from} />
          <Stop offset={String(stopAt)} stopColor={color} stopOpacity={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** An admin-managed banner (Homepage → Banners), drawn from its fields. */
export const BannerCard = memo(function BannerCard({ ad, variant, onPress, width, height, onImageError }: {
  ad: HomeBanner; variant: keyof typeof BANNER_HEIGHT; onPress?: (ad: HomeBanner) => void; width?: number; height?: number;
  /** The image failed — e.g. a signed link past its 6-hour window — so fetch fresh links. */
  onImageError?: () => void;
}) {
  const c = ad.content;
  const bg = hex6(c.backgroundColor, brand[600]);
  const fg = hex6(c.textColor, '#FFFFFF');
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [c.imageUrl]);
  const hasImage = Boolean(c.imageUrl) && !broken && /^https:\/\//i.test(c.imageUrl ?? '');
  const tappable = Boolean(onPress && c.ctaLink);
  const offer = variant === 'offer';

  const body = (
    <View style={[s.banner, { backgroundColor: bg, height: height ?? BANNER_HEIGHT[variant], width, borderRadius: offer ? 14 : 20 }]}>
      {hasImage ? (
        <Image source={{ uri: c.imageUrl }} onError={() => { setBroken(true); onImageError?.(); }} resizeMode="cover"
          style={offer ? s.offerImage : StyleSheet.absoluteFill} />
      ) : null}
      {offer ? (hasImage ? <View style={s.offerImageFade} pointerEvents="none"><Scrim color={bg} from={1} stopAt={0.6} /></View> : null)
        : <Scrim color={bg} from={hasImage ? 0.95 : 0.4} to={hasImage ? 0 : 0.1} stopAt={hasImage ? 0.75 : 1} />}
      <View style={[s.bannerText, { maxWidth: offer ? '60%' : '70%' }]}>
        {c.badgeText ? (
          <View style={[s.bannerBadge, { backgroundColor: `${fg}26` }]}>
            <Text variant="caption" weight="bold" color={fg} style={s.bannerBadgeText}>{c.badgeText.toUpperCase()}</Text>
          </View>
        ) : null}
        <Text weight="extrabold" color={fg} numberOfLines={3} style={offer ? s.bannerTitleOffer : s.bannerTitle}>{c.headline}</Text>
        {c.body && !offer ? <Text variant="caption" color={fg} numberOfLines={1} style={s.bannerBody}>{c.body}</Text> : null}
        {c.ctaText && c.ctaLink ? (
          offer ? (
            <View style={s.offerCta}><Text variant="caption" weight="bold" color={fg}>{c.ctaText}</Text><ArrowRight size={13} color={fg} /></View>
          ) : (
            <View style={s.bannerCta}><Text variant="caption" weight="bold" color={ink[900]}>{c.ctaText}</Text><ArrowRight size={14} color={ink[900]} /></View>
          )
        ) : null}
      </View>
    </View>
  );

  if (!tappable) return body;
  return (
    <ScalePressable onPress={() => onPress?.(ad)} accessibilityRole="button"
      accessibilityLabel={[c.headline, c.ctaText].filter(Boolean).join('. ')}>
      {body}
    </ScalePressable>
  );
});

const SLIDE_MS = 5000;

/**
 * A paged banner carousel: bundled artwork first, then any admin banners.
 * Every slide shares the artwork's aspect ratio, so nothing is cropped.
 */
export function BannerCarousel({ local, ads = [], adVariant, width, onOpenLocal, onOpenAd, onImageError, label }: {
  local: LocalBanner[]; ads?: HomeBanner[]; adVariant: 'hero' | 'campaign'; width: number;
  onOpenLocal: (b: LocalBanner) => void; onOpenAd: (ad: HomeBanner) => void; onImageError?: () => void; label: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = local.length + ads.length;
  const height = Math.round(width * BANNER_RATIO);

  const go = useCallback((i: number) => {
    if (!count) return;
    const next = (i + count) % count;
    ref.current?.scrollTo({ x: next * width, animated: !reduce });
    setIndex(next);
  }, [count, width, reduce]);

  useEffect(() => {
    if (reduce || paused || count < 2) return undefined;
    const t = setInterval(() => go(index + 1), SLIDE_MS);
    return () => clearInterval(t);
  }, [index, paused, reduce, count, go]);

  if (!count || width <= 0) return null;

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    setPaused(false);
  };

  return (
    <View style={[s.carousel, cardShadow, { height }]} accessibilityLabel={label}>
      <View style={s.carouselClip}>
        <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => setPaused(true)} onMomentumScrollEnd={onEnd} decelerationRate="fast">
          {local.map((b) => (
            <ScalePressable key={b.id} onPress={() => onOpenLocal(b)} accessibilityRole="button" accessibilityLabel={b.label}>
              <Image source={b.source} style={{ width, height }} resizeMode="cover" />
            </ScalePressable>
          ))}
          {ads.map((ad) => (
            <BannerCard key={ad._id} ad={ad} variant={adVariant} width={width} height={height} onPress={onOpenAd} onImageError={onImageError} />
          ))}
        </ScrollView>
      </View>
      {count > 1 ? (
        <View style={s.dots} pointerEvents="box-none">
          {Array.from({ length: count }).map((_, i) => (
            <ScalePressable key={i} onPress={() => go(i)} hitSlop={6} accessibilityRole="button"
              accessibilityLabel={`Slide ${i + 1} of ${count}`} accessibilityState={{ selected: i === index }}>
              <View style={[s.dot, i === index && s.dotActive]} />
            </ScalePressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* Explore services — service areas, a few on Home, "More Services" for the rest */

/** Two-line labels for areas whose catalogue name will not fit a 6-column tile. */
const SHORT_AREA: Record<string, string> = {
  electronics: 'Phones & Laptops',
  home_daily_help: 'Home & Daily Help',
  home_services: 'Repairs & Upkeep',
  beauty_care: 'Beauty & Care',
  errands_pickup: 'Errands & Pickup',
  helping_services: 'Helping Services',
  family_assist: 'Family Help',
  specialist_home: 'Specialist Services',
  local_pros: 'Local Pros',
};

/** 4 + 3 area tiles, then "More Services" — two rows of four. */
export const HOME_AREA_LIMIT = 7;

/**
 * One area tile, as in the reference: a white card, the photo across the top,
 * the label centred beneath it. No photo → the area's 3D icon on its pastel.
 */
const AreaTile = memo(function AreaTile({ width, label, a11y, photo, fallback, onPress }: {
  width: number; label: string; a11y: string; photo: ImageSourcePropType | null; fallback: React.ReactNode; onPress: () => void;
}) {
  const photoH = Math.round(width * 0.8);
  return (
    <ScalePressable onPress={onPress} style={[s.areaCard, cardShadow, { width }]} accessibilityRole="button" accessibilityLabel={a11y}>
      <View style={[s.areaPhoto, { height: photoH }]}>
        {/* Explicit size: a bundled image carries its pixel size as width/height,
            which would beat absoluteFill and show only its top-left corner. */}
        {photo ? <Image source={photo} style={{ width: width - 2, height: photoH }} resizeMode="cover" /> : fallback}
      </View>
      <View style={s.areaLabelBox}>
        <Text weight="semibold" color={ink[900]} numberOfLines={2} textBreakStrategy="simple" android_hyphenationFrequency="none"
          style={s.areaLabel}>{label}</Text>
      </View>
    </ScalePressable>
  );
});

export function ServiceGrid({ domains, width, onOpenArea, onMore }: {
  domains: LiveCatalogDomain[]; width: number;
  onOpenArea: (d: LiveCatalogDomain) => void; onMore: () => void;
}) {
  if (!domains.length) return null;
  const cols = 4;
  const gap = 10;
  const size = Math.floor((width - gap * (cols - 1)) / cols);
  const shown = domains.slice(0, HOME_AREA_LIMIT);
  return (
    <View>
      {/* No "View All": the "More Services" tile already opens every service. */}
      <SectionHead title="Explore Services" action={null} accent />
      <View style={[s.grid, { columnGap: gap }]}>
        {shown.map((d) => (
          <AreaTile key={d.code} width={size} label={SHORT_AREA[d.code] ?? d.name}
            a11y={`${d.name}, ${d.services.length} services`}
            photo={areaPhoto(d.code, d.imageUrl)}
            fallback={(
              <>
                <GradientFill colors={pastelFor(d.code)} id={`area${d.code}`} />
                <Image source={icon3d(icon3dKey({ code: d.code, icon: d.icon, name: d.name }))} style={{ width: size * 0.62, height: size * 0.62 }} resizeMode="contain" />
              </>
            )}
            onPress={() => onOpenArea(d)} />
        ))}
        <AreaTile width={size} label="More Services" a11y="More services: see all services" photo={null}
          fallback={(
            <>
              <GradientFill colors={['#F3F0FF', '#E6E0FF']} id="moreTile" />
              <MoreGlyph size={size * 0.5} />
            </>
          )}
          onPress={onMore} />
      </View>
    </View>
  );
}

/* Discover local stores */

const PROMO_ART_W = 140;

export function ZappyOnePromo({ onExplore }: { onExplore: () => void }) {
  return (
    <ScalePressable onPress={onExplore} accessibilityRole="button" accessibilityLabel="Discover local stores on ZappyOne. Explore stores">
      <View style={s.promo}>
        <GradientFill colors={['#F3F2FF', '#E6E5FF']} radius={20} horizontal id="promoBg" />
        {/* The shop stands on the card's bottom edge, like the artwork it's drawn from. */}
        <View style={s.promoArt}><StorefrontArt width={PROMO_ART_W} /></View>
        <View style={s.promoText}>
          <Text weight="bold" color={NAVY} style={s.promoTitle}>
            Discover Local Stores on <Text weight="bold" color="#2F55E6" style={s.promoTitle}>ZappyOne</Text>
          </Text>
          <Text color={ink[700]} style={s.promoBody}>Groceries, electronics, home needs and more from nearby shops.</Text>
          <View style={s.promoBtn}>
            <GradientFill colors={['#5B5CF2', '#3F3BD9']} radius={18} id="promoBtn" />
            <Text weight="bold" color="#FFFFFF" style={s.promoBtnText}>Explore Stores</Text>
            <ArrowRight size={15} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        </View>
      </View>
    </ScalePressable>
  );
}

/* Popular services */

/** Popular first (admin flag), then what is bookable at this address. */
export function pickPopular(services: HomeService[], max = 8): HomeService[] {
  const rank = (x: HomeService) => (x.isPopular ? 0 : 2) + (x.available === false ? 1 : 0);
  return [...services].sort((a, b) => rank(a) - rank(b)).slice(0, max);
}

const POP_W = 148;
const POP_MEDIA_H = 92;

export function PopularServices({ services, onOpen, onViewAll }: {
  services: HomeService[]; onOpen: (s: HomeService) => void; onViewAll: () => void;
}) {
  if (!services.length) return null;
  return (
    <View>
      <SectionHead title="Popular Services Near You" onAction={onViewAll} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent} style={s.bleed}>
        {services.map((svc) => {
          const covers = (svc.coverage ?? []).reduce((n, g) => n + (g.problems?.length ?? 0), 0);
          const photo = servicePhoto(svc.code, svc.imageUrl);
          return (
            <ScalePressable key={svc.code} onPress={() => onOpen(svc)} style={[s.card, cardShadow, { width: POP_W }]} accessibilityRole="button"
              accessibilityLabel={[svc.name, svc.isPopular ? 'Popular' : null, covers ? `${covers} problems covered` : null].filter(Boolean).join(', ')}>
              <View style={s.popMedia}>
                {photo
                  ? <Image source={photo} style={{ width: POP_W - 2, height: POP_MEDIA_H }} resizeMode="cover" />
                  : (
                    <>
                      <GradientFill colors={pastelFor(svc.domainCode)} id={`pop${svc.code}`} />
                      <Image source={icon3d(icon3dKey(svc))} style={s.popArt} resizeMode="contain" />
                    </>
                  )}
                {svc.isPopular ? (
                  <View style={s.mediaChipRight}>
                    <Flame size={11} color="#F97316" fill="#F97316" />
                    <Text weight="semibold" color="#C2410C" style={s.chipText}>Popular</Text>
                  </View>
                ) : null}
              </View>
              <View style={s.cardBody}>
                <Text weight="semibold" color={ink[900]} numberOfLines={1} style={s.cardTitle}>{svc.name}</Text>
                {covers > 0 ? (
                  <View style={s.inline}>
                    <CheckCircle2 size={12} color={GREEN} />
                    <Text color={ink[500]} numberOfLines={1} style={s.cardMeta}>{covers} issues covered</Text>
                  </View>
                ) : null}
                <View style={s.inline}>
                  <Text weight="semibold" color={ink[900]} style={s.cardStrong}>Book now</Text>
                  <ArrowRight size={12} color={ink[900]} strokeWidth={2.4} />
                </View>
              </View>
            </ScalePressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* Local stores */

const STORE_W = 152;

export function StoresRail({ shops, loading, hasLocation, onOpenShop, onViewAll, onSetLocation }: {
  shops: NearbyShop[]; loading: boolean; hasLocation: boolean;
  onOpenShop: (id: string) => void; onViewAll: () => void; onSetLocation: () => void;
}) {
  return (
    <View>
      <SectionHead title="Explore Local Stores on" trailing={<ZappyOneWord size={20} />} action={shops.length ? 'View All' : null} onAction={onViewAll} />
      {!hasLocation ? (
        <ScalePressable onPress={onSetLocation} style={[s.emptyRow, cardShadow]} accessibilityRole="button" accessibilityLabel="Set your location to see stores near you">
          <View style={s.emptyIcon}><MapPin size={18} color={BLUE} /></View>
          <View style={s.flex}>
            <Text weight="semibold" color={ink[900]} style={s.cardTitle}>See verified stores near you</Text>
            <Text color={ink[500]} style={s.cardMeta}>Set your location to find shops within 10 km.</Text>
          </View>
          <ChevronRight size={18} color={ink[400]} />
        </ScalePressable>
      ) : loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent} style={s.bleed}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[s.card, { width: STORE_W }]}><View style={[s.storeMedia, { backgroundColor: '#EEF0F5' }]} /><View style={s.cardBody}><View style={s.skelLine} /><View style={[s.skelLine, { width: '50%' }]} /></View></View>
          ))}
        </ScrollView>
      ) : shops.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent} style={s.bleed}>
          {shops.map((shop) => {
            const services = (shop.services ?? []).map((x) => (typeof x === 'string' ? x : x.name)).join(', ') || shop.category || '';
            const uploaded = Boolean(shop.coverImageUrl && /^https:\/\//i.test(shop.coverImageUrl));
            return (
              <ScalePressable key={shop._id} onPress={() => onOpenShop(shop._id)} style={[s.card, cardShadow, { width: STORE_W }]} accessibilityRole="button" accessibilityLabel={shop.businessName}>
                <View style={s.storeMedia}>
                  {uploaded
                    ? <Image source={{ uri: shop.coverImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    : (
                      <>
                        <GradientFill colors={['#F1F0FF', '#E4E6FF']} id={`shop${shop._id}`} />
                        <Image source={icon3d('store')} style={s.popArt} resizeMode="contain" />
                      </>
                    )}
                  {/* Only verified shops are returned by /shops/nearby. */}
                  <View style={s.mediaChipLeft}>
                    <CheckCircle2 size={11} color="#FFFFFF" fill={GREEN} />
                    <Text weight="semibold" color={GREEN} style={s.chipText}>Verified</Text>
                  </View>
                </View>
                <View style={s.cardBody}>
                  <Text weight="semibold" color={ink[900]} numberOfLines={2} style={s.cardTitle}>{shop.businessName}</Text>
                  {/* A new shop's rating is the schema default, not a review. */}
                  {(shop.reviewCount ?? 0) > 0 ? (
                    <View style={s.inline}>
                      <Star size={12} color={GREEN} fill={GREEN} />
                      <Text weight="semibold" color={ink[900]} style={s.cardMeta}>{Number(shop.rating ?? 0).toFixed(1)}</Text>
                      <Text color={ink[400]} style={s.cardMeta}>({shop.reviewCount})</Text>
                    </View>
                  ) : null}
                  {services ? <Text color={ink[500]} numberOfLines={2} style={s.cardMeta}>{services}</Text> : null}
                  {shop.openNow != null ? (
                    <View style={[s.inline, s.storeFoot]}>
                      <Clock size={12} color={shop.openNow ? GREEN : ink[400]} />
                      <Text weight="medium" color={shop.openNow ? GREEN : ink[400]} style={s.cardMeta} numberOfLines={1}>
                        {shop.openNow ? `Open now${shop.todayHours?.closesAt ? ` · till ${shop.todayHours.closesAt}` : ''}` : 'Closed now'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </ScalePressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={[s.emptyRow, cardShadow]}>
          <View style={s.emptyIcon}><ShieldCheck size={18} color={BLUE} /></View>
          <View style={s.flex}>
            <Text weight="semibold" color={ink[900]} style={s.cardTitle}>No verified stores within 10 km yet</Text>
            <Text color={ink[500]} style={s.cardMeta}>New shops join every week. You can still book any service above.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/* Offers & deals */

const OFFER_FILLS: [string, string][] = [['#3B74FF', '#1D47D6'], ['#FFA142', '#F2650F'], ['#A66BFA', '#6D2BD9']];

export function OffersRail({ ads, promos, width, onOpenAd, onCopy, onImageError, onLayout }: {
  ads: HomeBanner[]; promos: AvailablePromo[]; width: number; onOpenAd: (ad: HomeBanner) => void; onCopy: (code: string) => void;
  onImageError?: () => void; onLayout?: (y: number) => void;
}) {
  if (!ads.length && !promos.length) return null;
  const gap = 10;
  const cardW = Math.floor((width - gap * 2) / 3);
  return (
    <View onLayout={(e) => onLayout?.(e.nativeEvent.layout.y)}>
      <SectionHead title="Offers & Deals for You" action={null} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.railContent, { gap }]} style={s.bleed}>
        {ads.map((ad) => <BannerCard key={ad._id} ad={ad} variant="offer" width={260} onPress={onOpenAd} onImageError={onImageError} />)}
        {promos.slice(0, 6).map((p, i) => {
          const flat = p.type !== 'percent';
          const amount = flat ? `${rupees(p.discountValue)} OFF` : `${p.discountValue}% OFF`;
          const art = p.services?.length ? icon3dKey({ code: p.services[0] }) : 'gift';
          const terms = [
            !flat && p.maxDiscountPaise ? `up to ${rupees(p.maxDiscountPaise)}` : null,
            p.minOrderPaise ? `on ${rupees(p.minOrderPaise)}+` : null,
            p.expiresAt ? `till ${fmtDay(p.expiresAt)}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <ScalePressable key={p.code} onPress={() => onCopy(p.code)} accessibilityRole="button"
              accessibilityLabel={`${p.name}, ${flat ? 'flat' : ''} ${amount}${terms ? `, ${terms}` : ''}. Code ${p.code}`}
              style={[s.offer, { width: cardW }]}>
              <GradientFill colors={OFFER_FILLS[i % OFFER_FILLS.length]} radius={14} horizontal id={`offer${p.code}`} />
              <Image source={icon3d(art === 'sparkles' ? 'gift' : art)} style={s.offerArt} resizeMode="contain" />
              <Text weight="bold" color="#FFFFFF" numberOfLines={1} style={s.offerName}>{p.name}</Text>
              <Text weight="bold" color="rgba(255,255,255,0.92)" style={s.offerKind}>{flat ? 'FLAT' : 'SAVE'}</Text>
              <Text weight="extrabold" color="#FFFFFF" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={s.offerAmount}>{amount}</Text>
            </ScalePressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* Book again & recent activity */

export interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  code: string;
  state: 'active' | 'completed' | 'closed';
  onPress: () => void;
}

export function BookAgainList({ items, width, busyId, onRebook, onViewAll }: {
  items: { id: string; title: string; date?: string; code: string }[]; width: number;
  busyId: string | null; onRebook: (id: string) => void; onViewAll: () => void;
}) {
  if (!items.length) return null;
  const itemW = Math.floor((width - 2) / 2);
  return (
    <View>
      <SectionHead title="Book Again" onAction={onViewAll} />
      <View style={[s.list, cardShadow]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={itemW} decelerationRate="fast">
          {items.map((it, i) => (
            <View key={it.id} style={[s.againItem, { width: itemW }, i > 0 && s.againDivider]}>
              <Icon3DTile iconKey={icon3dKey({ code: it.code, name: it.title })} size={42} radius={10} pastel={['#EEF3FF', '#DCE6FF']} iconScale={0.72} />
              <View style={s.flex}>
                <Text weight="semibold" color={ink[900]} numberOfLines={2} style={s.againTitle}>{it.title}</Text>
                <Text color={ink[500]} numberOfLines={1} style={s.againDate}>{it.date ? `Last booked · ${fmtDay(it.date)}` : 'Booked before'}</Text>
                <ScalePressable onPress={() => onRebook(it.id)} disabled={Boolean(busyId)} style={[s.outlineBtn, busyId && s.disabled]}
                  accessibilityRole="button" accessibilityLabel={`Book ${it.title} again`}>
                  <Text weight="semibold" color={BLUE} style={s.outlineBtnText}>{busyId === it.id ? 'Booking…' : 'Book Again'}</Text>
                </ScalePressable>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

export function RecentActivity({ items, onViewAll }: { items: ActivityItem[]; onViewAll: () => void }) {
  if (!items.length) return null;
  return (
    <View>
      <SectionHead title="Your Recent Activity" action="All Bookings" onAction={onViewAll} />
      <View style={[s.list, cardShadow]}>
        {items.map((it, i) => {
          const Icon = it.state === 'active' ? Clock : it.state === 'completed' ? CheckCircle2 : XCircle;
          const tone = it.state === 'closed' ? ink[400] : GREEN;
          const bg = it.state === 'closed' ? '#F1F2F5' : '#E8F7EE';
          return (
            <ScalePressable key={it.id} onPress={it.onPress} style={[s.listRow, i > 0 && s.listDivider]} accessibilityRole="button"
              accessibilityLabel={`${it.title}. ${it.subtitle}`}>
              <View style={[s.activityIcon, { backgroundColor: bg }]}><Icon size={22} color={tone} strokeWidth={2} /></View>
              <View style={s.flex}>
                <Text weight="semibold" color={ink[900]} numberOfLines={1} style={s.activityTitle}>{it.title}</Text>
                <Text color={ink[500]} numberOfLines={1} style={s.activitySub}>{it.subtitle}</Text>
              </View>
              <ChevronRight size={20} color={ink[700]} />
            </ScalePressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bleed: { marginHorizontal: -16 },
  railContent: { paddingHorizontal: 16, gap: 10, paddingTop: 2, paddingBottom: 8 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 5, flex: 1 },
  sectionTitle: { fontSize: 19, lineHeight: 25, letterSpacing: -0.4 },
  sectionAccent: { width: 4, height: 20, borderRadius: 2, backgroundColor: '#F97316', marginRight: 4, alignSelf: 'center' },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  sectionActionText: { fontSize: 14, lineHeight: 18 },

  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, minHeight: 26, alignSelf: 'flex-start', maxWidth: '100%' },
  locationText: { fontSize: 14, lineHeight: 19 },
  roundHit: { width: 50, height: 50 },
  roundBtn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  roundSolid: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EEF0F6' },
  profileBtn: { backgroundColor: '#E5ECFF', borderColor: '#E5ECFF' },
  hidden: { opacity: 0 },
  floatWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  edgeFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  floatPill: { height: 44, borderRadius: 22, justifyContent: 'center', paddingHorizontal: 14 },
  floatPillInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 21, height: 21, borderRadius: 11, paddingHorizontal: 5,
    backgroundColor: RED, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, lineHeight: 13 },

  search: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, borderRadius: 28, paddingHorizontal: 18 },
  searchSolid: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE },
  searchText: { fontSize: 14, lineHeight: 19 },
  searchDivider: { width: 1, height: 24, backgroundColor: LINE },

  switch: { flexDirection: 'row', gap: 6, padding: 6, borderRadius: 18 },
  switchSolid: { backgroundColor: '#EBEFFD' },
  switchActiveWrap: { flex: 1 },
  switchItem: { flex: 1, height: 54, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 6 },
  switchActive: { overflow: 'hidden' },
  switchText: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2 },
  switchUnderline: { textDecorationLine: 'underline' },
  switchPointer: {
    position: 'absolute', bottom: -9, left: '50%', marginLeft: -9, width: 0, height: 0,
    borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#1D43CC',
  },
  newBadge: {
    position: 'absolute', top: -14, right: 2, backgroundColor: '#F0456A', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 2, borderWidth: 2, borderColor: '#FFFFFF',
  },
  newBadgeText: { fontSize: 11, lineHeight: 14 },

  carousel: { borderRadius: 20, backgroundColor: '#E9EEFB' },
  carouselClip: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  banner: { overflow: 'hidden', justifyContent: 'center' },
  bannerText: { paddingHorizontal: 16, paddingVertical: 14 },
  bannerBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  bannerBadgeText: { letterSpacing: 0.5 },
  bannerTitle: { fontSize: 20, lineHeight: 24, letterSpacing: -0.4 },
  bannerTitleOffer: { fontSize: 17, lineHeight: 21, letterSpacing: -0.3 },
  bannerBody: { marginTop: 4, opacity: 0.92 },
  bannerCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10,
    backgroundColor: '#FFFFFF', borderRadius: 18, height: 36, paddingHorizontal: 14,
  },
  offerCta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  offerImage: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '42%' },
  offerImageFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '42%' },
  dots: { position: 'absolute', bottom: 7, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 0.5, borderColor: 'rgba(20,32,90,0.25)' },
  dotActive: { width: 20, backgroundColor: '#FFFFFF' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  areaCard: { borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDEFF5' },
  areaPhoto: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderTopLeftRadius: 11, borderTopRightRadius: 11, backgroundColor: '#EEF1F8',
  },
  areaLabelBox: { minHeight: 40, paddingHorizontal: 4, paddingVertical: 5, alignItems: 'center', justifyContent: 'center' },
  areaLabel: { textAlign: 'center', fontSize: 12, lineHeight: 15, letterSpacing: -0.2 },

  promo: {
    flexDirection: 'row', alignItems: 'stretch', gap: 6, paddingRight: 14, paddingLeft: 2,
    borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#E1E2FB',
  },
  promoArt: { justifyContent: 'flex-end', paddingTop: 6 },
  promoText: { flex: 1, minWidth: 0, justifyContent: 'center', paddingVertical: 14 },
  promoTitle: { fontSize: 15.5, lineHeight: 20, letterSpacing: -0.4 },
  promoBody: { marginTop: 4, fontSize: 11.5, lineHeight: 15.5 },
  promoBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, height: 36, marginTop: 10,
    paddingHorizontal: 16, borderRadius: 18, overflow: 'hidden',
  },
  promoBtnText: { fontSize: 12, lineHeight: 16 },

  card: { borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE },
  popMedia: { height: 92, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderTopLeftRadius: 13, borderTopRightRadius: 13 },
  popArt: { width: 66, height: 66 },
  storeMedia: { height: 96, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderTopLeftRadius: 13, borderTopRightRadius: 13 },
  cardBody: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 3 },
  cardTitle: { fontSize: 13, lineHeight: 17, letterSpacing: -0.2 },
  cardMeta: { fontSize: 11, lineHeight: 15 },
  cardStrong: { fontSize: 12.5, lineHeight: 17 },
  storeFoot: { marginTop: 2 },
  mediaChipRight: {
    position: 'absolute', right: 7, top: 7, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFF4E8', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
  },
  mediaChipLeft: {
    position: 'absolute', left: 7, top: 7, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
  },
  chipText: { fontSize: 10.5, lineHeight: 14 },
  skelLine: { height: 12, width: '75%', borderRadius: 6, backgroundColor: '#EEF0F5', marginTop: 4 },

  emptyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF',
  },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF3FF', alignItems: 'center', justifyContent: 'center' },

  offer: { height: 78, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9, overflow: 'hidden' },
  offerArt: { position: 'absolute', right: -6, bottom: -6, width: 50, height: 50, opacity: 0.95 },
  offerName: { fontSize: 12.5, lineHeight: 16, letterSpacing: -0.2 },
  offerKind: { fontSize: 9, lineHeight: 12, marginTop: 2, letterSpacing: 0.4 },
  offerAmount: { fontSize: 19, lineHeight: 24, letterSpacing: -0.5, maxWidth: '88%' },

  list: { borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 66 },
  listDivider: { borderTopWidth: 1, borderTopColor: LINE },
  againItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingHorizontal: 12, paddingVertical: 12 },
  againDivider: { borderLeftWidth: 1, borderLeftColor: LINE },
  againTitle: { fontSize: 12.5, lineHeight: 16 },
  againDate: { fontSize: 10.5, lineHeight: 14, marginTop: 1 },
  outlineBtn: {
    alignSelf: 'flex-start', marginTop: 7, borderWidth: 1.2, borderColor: BLUE, borderRadius: 16, height: 28,
    paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
  },
  outlineBtnText: { fontSize: 11.5, lineHeight: 15 },
  disabled: { opacity: 0.5 },
  activityIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  activityTitle: { fontSize: 14, lineHeight: 19 },
  activitySub: { fontSize: 12, lineHeight: 16, marginTop: 1 },
});
