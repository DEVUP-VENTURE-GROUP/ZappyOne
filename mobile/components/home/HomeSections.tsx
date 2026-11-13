/**
 * Home sections — the redesigned customer Home, in the same order and on the
 * same data rules as the website (client/src/features/home):
 *
 *   header · search · Book a service / Local stores · hero · services ·
 *   ZappyOne stores · popular · campaigns · stores near you · offers ·
 *   book again · recent activity
 *
 * Every number shown comes from the API. A section with nothing real to show
 * renders nothing. Colours come from theme/brand.ts (the web's own values).
 */

import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Image, ScrollView, StyleSheet, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowRight, Bell, CheckCircle2, ChevronDown, ChevronRight, Clock, MapPin, Search,
  ShieldCheck, Star, Store, UserRound, Wrench, XCircle,
} from 'lucide-react-native';
import { ScalePressable, Text } from '../ui';
import { iconFor } from '../catalog/liveCatalog';
import { ServiceIllustration } from '../catalog/ServiceIllustration';
import { illustrationFor } from '../catalog/illustrations/resolve';
import type { HomeBanner, AvailablePromo } from '../../services/api/homeApi';
import type { LiveCatalogService, Shop } from '../../types/api';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { amber, brand, brandRadius, ink, successInk, surface, tintFor } from '../../theme/brand';

const MARK = require('../../assets/images/zappy-mark.png');

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
 * this app has opens natively; a page only the website has (repair, pet,
 * helping, events) opens on the website in the in-app browser; https links
 * open as given.
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

const fmtDay = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
const hex6 = (v: string | undefined, fallback: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);

/* Building blocks */

export function SectionHead({ title, action, onAction, trailing }: {
  title: string; action?: string | null; onAction?: () => void; trailing?: React.ReactNode;
}) {
  return (
    <View style={s.sectionHead}>
      <View style={s.sectionTitleRow}>
        <Text variant="heading3" weight="extrabold" color={ink[900]} style={s.sectionTitle} accessibilityRole="header">{title}</Text>
        {trailing}
      </View>
      {action && onAction ? (
        <ScalePressable onPress={onAction} accessibilityRole="button" accessibilityLabel={`${action}: ${title}`} style={s.sectionAction} hitSlop={8}>
          <Text variant="bodySmall" weight="bold" color={brand[600]}>{action}</Text>
          <ChevronRight size={15} color={brand[600]} strokeWidth={2.4} />
        </ScalePressable>
      ) : null}
    </View>
  );
}

/** The real mark (assets/images/zappy-mark.png, from the web's zappy-mark.webp) with the wordmark beside it. */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <View style={s.wordmark} accessibilityRole="image" accessibilityLabel="ZappyOne">
      <Image source={MARK} style={{ height: size, width: size * (179 / 120) }} resizeMode="contain" />
      <Text weight="black" style={{ fontSize: Math.round(size * 0.72), lineHeight: Math.round(size * 0.9), letterSpacing: -0.4 }}>
        <Text weight="black" color={brand[600]} style={{ fontSize: Math.round(size * 0.72) }}>Zappy</Text>
        <Text weight="black" color={amber} style={{ fontSize: Math.round(size * 0.72) }}>One</Text>
      </Text>
    </View>
  );
}

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

/* Header, search, switch */

export function HomeTopBar({ location, onPickLocation, unread, onBell, onProfile }: {
  location: string | null; onPickLocation: () => void; unread: number; onBell: () => void; onProfile: () => void;
}) {
  return (
    <View style={s.topBar}>
      <View style={s.flex}>
        <Wordmark size={26} />
        <ScalePressable onPress={onPickLocation} style={s.locationRow} accessibilityRole="button"
          accessibilityLabel={location ? `Service location: ${location}. Change location` : 'Set your location'}>
          <MapPin size={15} color={amber} strokeWidth={2.4} />
          <Text variant="bodySmall" weight="extrabold" color={brand[700]} numberOfLines={1} style={s.flexShrink}>
            {location ?? 'Set your location'}
          </Text>
          <ChevronDown size={15} color={brand[600]} strokeWidth={2.6} />
        </ScalePressable>
      </View>
      <ScalePressable onPress={onBell} style={s.roundBtn} accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}>
        <Bell size={19} color={brand[700]} />
        {unread > 0 ? (
          <View style={s.badge}><Text style={s.badgeText} color="#FFFFFF" weight="bold">{unread > 9 ? '9+' : unread}</Text></View>
        ) : null}
      </ScalePressable>
      <ScalePressable onPress={onProfile} style={[s.roundBtn, s.profileBtn]} accessibilityRole="button" accessibilityLabel="Your profile">
        <UserRound size={19} color={brand[700]} />
      </ScalePressable>
    </View>
  );
}

export function SearchTrigger({ onPress }: { onPress: () => void }) {
  return (
    <ScalePressable onPress={onPress} style={s.search} accessibilityRole="search" accessibilityLabel="Search for services or problems">
      <Search size={19} color={ink[500]} strokeWidth={2.3} />
      <Text variant="body" color={ink[400]} numberOfLines={1} style={s.flex}>Search for services or problems…</Text>
    </ScalePressable>
  );
}

export function ModeSwitch({ onStores }: { onStores: () => void }) {
  return (
    <View style={s.switch} accessibilityRole="tablist">
      <View style={[s.switchItem, s.switchActive]} accessibilityRole="tab" accessibilityState={{ selected: true }}>
        <Wrench size={17} color="#FFFFFF" strokeWidth={2.2} />
        <Text variant="bodySmall" weight="extrabold" color="#FFFFFF">Book a service</Text>
      </View>
      <ScalePressable onPress={onStores} style={s.switchItem} accessibilityRole="tab" accessibilityState={{ selected: false }}>
        <Store size={17} color={brand[700]} strokeWidth={2.2} />
        <Text variant="bodySmall" weight="extrabold" color={brand[700]}>Local stores</Text>
      </ScalePressable>
    </View>
  );
}

/* Banners (admin-managed) */

const BANNER_HEIGHT = { hero: 188, campaign: 164, offer: 132 } as const;

export const BannerCard = memo(function BannerCard({ ad, variant, onPress, width, onImageError }: {
  ad: HomeBanner; variant: keyof typeof BANNER_HEIGHT; onPress?: (ad: HomeBanner) => void; width?: number;
  /** The image failed — e.g. a signed link past its 6-hour window — so fetch fresh links. */
  onImageError?: () => void;
}) {
  const c = ad.content;
  const bg = hex6(c.backgroundColor, brand[600]);
  const fg = hex6(c.textColor, '#FFFFFF');
  const [broken, setBroken] = useState(false);
  // A refreshed signed link gets a fresh attempt.
  useEffect(() => { setBroken(false); }, [c.imageUrl]);
  const hasImage = Boolean(c.imageUrl) && !broken && /^https:\/\//i.test(c.imageUrl ?? '');
  const tappable = Boolean(onPress && c.ctaLink);
  const offer = variant === 'offer';

  const body = (
    <View style={[s.banner, { backgroundColor: bg, height: BANNER_HEIGHT[variant], width, borderRadius: offer ? brandRadius.card : brandRadius.hero }]}>
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

const SLIDE_MS = 6000;

/** One fallback slide per live service area, when no admin hero banner is running. */
function CatalogSlide({ service, width, onOpen }: { service: HomeService; width: number; onOpen: (s: HomeService) => void }) {
  return (
    <ScalePressable onPress={() => onOpen(service)} accessibilityRole="button" accessibilityLabel={`Book ${service.name}`}>
      <View style={[s.banner, s.catalogSlide, { width, height: BANNER_HEIGHT.hero }]}>
        <View style={[s.bannerText, { maxWidth: '62%' }]}>
          <Text variant="caption" weight="bold" color="rgba(255,255,255,0.75)" style={s.eyebrow}>BOOK A SERVICE</Text>
          <Text weight="extrabold" color="#FFFFFF" numberOfLines={2} style={s.bannerTitle}>{service.name}</Text>
          {service.tagline ? <Text variant="caption" color="rgba(255,255,255,0.88)" numberOfLines={2} style={s.bannerBody}>{service.tagline}</Text> : null}
          <View style={s.bannerCta}><Text variant="caption" weight="bold" color={ink[900]}>Book now</Text><ArrowRight size={14} color={ink[900]} /></View>
        </View>
        <View style={s.catalogArt}>
          <ServiceIllustration name={illustrationFor({ code: service.code, name: service.name })} size={118} onColor />
        </View>
      </View>
    </ScalePressable>
  );
}

export function HeroCarousel({ banners, services, width, onOpenBanner, onOpenService, onImageError }: {
  banners: HomeBanner[]; services: HomeService[]; width: number;
  onOpenBanner: (ad: HomeBanner) => void; onOpenService: (s: HomeService) => void; onImageError?: () => void;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Fallback: the first service of each area, so one slide per area.
  const slides = useMemo(() => {
    const seen = new Set<string>();
    return services.filter((x) => (seen.has(x.domainCode) ? false : (seen.add(x.domainCode), true))).slice(0, 6);
  }, [services]);
  const useBanners = banners.length > 0;
  const count = useBanners ? banners.length : slides.length;

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

  useEffect(() => { ref.current?.scrollTo({ x: 0, animated: false }); setIndex(0); }, [useBanners]);

  if (!count || width <= 0) return null;

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    setPaused(false);
  };

  return (
    <View style={s.hero} accessibilityLabel="Featured">
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setPaused(true)} onMomentumScrollEnd={onEnd} decelerationRate="fast">
        {useBanners
          ? banners.map((ad) => <BannerCard key={ad._id} ad={ad} variant="hero" width={width} onPress={onOpenBanner} onImageError={onImageError} />)
          : slides.map((svc) => <CatalogSlide key={svc.code} service={svc} width={width} onOpen={onOpenService} />)}
      </ScrollView>
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

export function CampaignBanners({ ads, width, onOpen, onImageError }: {
  ads: HomeBanner[]; width: number; onOpen: (ad: HomeBanner) => void; onImageError?: () => void;
}) {
  if (!ads.length) return null;
  if (ads.length === 1) return <BannerCard ad={ads[0]} variant="campaign" width={width} onPress={onOpen} onImageError={onImageError} />;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={width * 0.88 + 12} decelerationRate="fast"
      contentContainerStyle={s.railContent} style={s.bleed}>
      {ads.map((ad) => <BannerCard key={ad._id} ad={ad} variant="campaign" width={width * 0.88} onPress={onOpen} onImageError={onImageError} />)}
    </ScrollView>
  );
}

/* Explore services */

const ServiceTile = memo(function ServiceTile({ service, onOpen, size }: { service: HomeService; onOpen: (s: HomeService) => void; size: number }) {
  const tint = tintFor(service.domainCode);
  const Icon = iconFor(service.icon);
  return (
    <ScalePressable onPress={() => onOpen(service)} style={[s.tile, { width: size }]} accessibilityRole="button" accessibilityLabel={service.name}>
      <View style={[s.tileArt, { backgroundColor: tint.bg, width: size, height: size }]}>
        {service.imageUrl
          ? <Image source={{ uri: service.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <Icon size={Math.round(size * 0.4)} color={tint.fg} strokeWidth={1.9} />}
      </View>
      <Text variant="caption" weight="semibold" color={ink[900]} numberOfLines={2} style={s.tileLabel}>{service.name}</Text>
    </ScalePressable>
  );
});

export function ServiceGrid({ services, width, onOpen, onViewAll }: {
  services: HomeService[]; width: number; onOpen: (s: HomeService) => void; onViewAll: () => void;
}) {
  if (!services.length) return null;
  const cols = width >= 520 ? 6 : 4;
  const gap = 10;
  const size = Math.floor((width - gap * (cols - 1)) / cols);
  // Bookable here first; stable, so catalogue order holds within each group.
  const tiles = [...services].sort((a, b) => Number(a.available === false) - Number(b.available === false));
  return (
    <View>
      <SectionHead title="Explore services" action="View all" onAction={onViewAll} />
      <View style={[s.grid, { columnGap: gap }]}>
        {tiles.map((svc) => <ServiceTile key={svc.code} service={svc} size={Math.min(size, 88)} onOpen={onOpen} />)}
      </View>
    </View>
  );
}

/* ZappyOne promotion */

function StorefrontArt({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 160 120" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ellipse cx="80" cy="112" rx="70" ry="6" fill={brand[100]} />
      <Circle cx="22" cy="88" r="16" fill="#86EFAC" /><Rect x="20" y="92" width="4" height="18" rx="2" fill="#65A30D" />
      <Circle cx="140" cy="86" r="14" fill="#86EFAC" /><Rect x="138" y="90" width="4" height="20" rx="2" fill="#65A30D" />
      <Rect x="32" y="40" width="96" height="70" rx="6" fill="#FFFFFF" stroke={brand[200]} strokeWidth="2" />
      <Rect x="40" y="18" width="80" height="16" rx="5" fill={brand[600]} />
      <Rect x="54" y="23" width="52" height="6" rx="3" fill="#FFFFFF" opacity={0.9} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Path key={i} d={`M${30 + i * 16.7} 34 h16.7 v10 a8.35 8.35 0 0 1 -16.7 0z`} fill={i % 2 ? '#FFFFFF' : brand[600]} stroke={brand[600]} strokeWidth="1.2" />
      ))}
      <Rect x="44" y="60" width="34" height="26" rx="3" fill={brand[50]} stroke={brand[200]} />
      <Rect x="49" y="70" width="10" height="12" rx="2" fill={amber} opacity={0.8} />
      <Rect x="62" y="66" width="11" height="16" rx="2" fill={brand[300]} />
      <Rect x="88" y="60" width="28" height="50" rx="3" fill={brand[700]} />
      <Circle cx="110" cy="86" r="2" fill={amber} />
    </Svg>
  );
}

export function ZappyOnePromo({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={s.promo}>
      <StorefrontArt size={100} />
      <View style={s.flex}>
        <Text weight="extrabold" color={ink[900]} style={s.promoTitle}>Discover local stores on</Text>
        <View style={s.promoMark}><Wordmark size={20} /></View>
        <Text variant="caption" color={ink[500]} style={s.promoBody}>
          Verified neighbourhood shops near you. Walk in, or book their service directly.
        </Text>
        <ScalePressable onPress={onExplore} style={s.promoBtn} accessibilityRole="button" accessibilityLabel="Explore local stores">
          <Text variant="caption" weight="bold" color="#FFFFFF">Explore stores</Text>
          <ArrowRight size={14} color="#FFFFFF" />
        </ScalePressable>
      </View>
    </View>
  );
}

/* Popular services */

/** Popular first (admin flag), then what is bookable at this address. */
export function pickPopular(services: HomeService[], max = 8): HomeService[] {
  const rank = (x: HomeService) => (x.isPopular ? 0 : 2) + (x.available === false ? 1 : 0);
  return [...services].sort((a, b) => rank(a) - rank(b)).slice(0, max);
}

export function PopularServices({ services, onOpen, onViewAll }: {
  services: HomeService[]; onOpen: (s: HomeService) => void; onViewAll: () => void;
}) {
  if (!services.length) return null;
  return (
    <View>
      <SectionHead title="Popular services near you" action="View all" onAction={onViewAll} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent} style={s.bleed}>
        {services.map((svc) => {
          const tint = tintFor(svc.domainCode);
          const covers = (svc.coverage ?? []).reduce((n, g) => n + (g.problems?.length ?? 0), 0);
          return (
            <ScalePressable key={svc.code} onPress={() => onOpen(svc)} style={s.card} accessibilityRole="button" accessibilityLabel={svc.name}>
              <View style={[s.cardMedia, { backgroundColor: tint.bg }]}>
                {svc.imageUrl
                  ? <Image source={{ uri: svc.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  : <ServiceIllustration name={illustrationFor({ code: svc.code, name: svc.name })} size={84} />}
                {svc.isPopular ? <View style={s.mediaChip}><Text variant="caption" weight="bold" color="#B45309">Popular</Text></View> : null}
              </View>
              <View style={s.cardBody}>
                <Text variant="body" weight="bold" color={ink[900]} numberOfLines={1}>{svc.name}</Text>
                {svc.tagline || svc.description ? (
                  <Text variant="caption" color={ink[500]} numberOfLines={2}>{svc.tagline || svc.description}</Text>
                ) : null}
                <View style={s.cardMeta}>
                  {svc.available === true ? (
                    <View style={s.inline}><CheckCircle2 size={13} color={successInk} /><Text variant="caption" weight="semibold" color={successInk}>Available here</Text></View>
                  ) : null}
                  {svc.available === false ? <Text variant="caption" color={ink[400]}>Coming to your area</Text> : null}
                  {covers > 0 ? <Text variant="caption" weight="semibold" color={ink[500]}>{covers} problems covered</Text> : null}
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

export function StoresRail({ shops, loading, onOpenShop, onViewAll }: {
  shops: NearbyShop[]; loading: boolean; onOpenShop: (id: string) => void; onViewAll: () => void;
}) {
  return (
    <View>
      <SectionHead title="Explore local stores on" trailing={<Wordmark size={18} />} action={shops.length ? 'View all' : null} onAction={onViewAll} />
      {loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent} style={s.bleed}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={s.card}><View style={[s.cardMedia, { backgroundColor: surface.sunken }]} /><View style={s.cardBody}><View style={s.skelLine} /><View style={[s.skelLine, { width: '50%' }]} /></View></View>
          ))}
        </ScrollView>
      ) : shops.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent} style={s.bleed}>
          {shops.map((shop) => {
            const services = (shop.services ?? []).map((x) => (typeof x === 'string' ? x : x.name)).join(' · ') || shop.category || '';
            return (
              <ScalePressable key={shop._id} onPress={() => onOpenShop(shop._id)} style={s.card} accessibilityRole="button" accessibilityLabel={shop.businessName}>
                <View style={[s.cardMedia, { backgroundColor: surface.sunken }]}>
                  {shop.coverImageUrl
                    ? <Image source={{ uri: shop.coverImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    : <Store size={30} color={ink[300]} strokeWidth={1.5} />}
                  {/* Only verified shops are returned by /shops/nearby. */}
                  <View style={[s.mediaChip, s.inline]}><ShieldCheck size={12} color={successInk} /><Text variant="caption" weight="bold" color={successInk}>Verified</Text></View>
                </View>
                <View style={s.cardBody}>
                  <Text variant="body" weight="bold" color={ink[900]} numberOfLines={1}>{shop.businessName}</Text>
                  {/* A new shop's rating is the schema default, not a review. */}
                  {(shop.reviewCount ?? 0) > 0 ? (
                    <View style={s.inline}>
                      <Star size={13} color="#FBBF24" fill="#FBBF24" />
                      <Text variant="caption" weight="semibold" color={ink[700]}>{Number(shop.rating ?? 0).toFixed(1)}</Text>
                      <Text variant="caption" color={ink[400]}>({shop.reviewCount})</Text>
                    </View>
                  ) : null}
                  {services ? <Text variant="caption" color={ink[500]} numberOfLines={2}>{services}</Text> : null}
                  {shop.openNow === true ? <Text variant="caption" weight="semibold" color={successInk}>Open now{shop.todayHours?.closesAt ? ` · till ${shop.todayHours.closesAt}` : ''}</Text> : null}
                  {shop.openNow === false ? <Text variant="caption" weight="semibold" color={ink[400]}>Closed now</Text> : null}
                </View>
              </ScalePressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={s.emptyRow}>
          <View style={s.emptyIcon}><MapPin size={18} color={brand[600]} /></View>
          <View style={s.flex}>
            <Text variant="bodySmall" weight="semibold" color={ink[900]}>No verified stores within 10 km yet</Text>
            <Text variant="caption" color={ink[500]}>New shops join every week. You can still book any service above.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/* Offers & deals */

const COUPON_FILLS = [brand[600], '#EA580C', '#7C3AED'];

export function OffersRail({ ads, promos, onOpenAd, onCopy, onImageError }: {
  ads: HomeBanner[]; promos: AvailablePromo[]; onOpenAd: (ad: HomeBanner) => void; onCopy: (code: string) => void;
  onImageError?: () => void;
}) {
  if (!ads.length && !promos.length) return null;
  return (
    <View>
      <SectionHead title="Offers & deals for you" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent} style={s.bleed}>
        {ads.map((ad) => <BannerCard key={ad._id} ad={ad} variant="offer" width={260} onPress={onOpenAd} onImageError={onImageError} />)}
        {promos.slice(0, 6).map((p, i) => {
          const headline = p.type === 'percent' ? `${p.discountValue}% OFF` : `${rupees(p.discountValue)} OFF`;
          const terms = [
            p.type === 'percent' && p.maxDiscountPaise ? `up to ${rupees(p.maxDiscountPaise)}` : null,
            p.minOrderPaise ? `on ${rupees(p.minOrderPaise)}+` : null,
            p.validity?.endAt ? `till ${fmtDay(p.validity.endAt)}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <ScalePressable key={p.code} onPress={() => onCopy(p.code)} accessibilityRole="button"
              accessibilityLabel={`${headline}, ${p.name}. Code ${p.code}. Copy code`}
              style={[s.coupon, { backgroundColor: COUPON_FILLS[i % COUPON_FILLS.length] }]}>
              <View>
                <Text variant="caption" weight="semibold" color="rgba(255,255,255,0.9)" numberOfLines={1}>{p.name}</Text>
                <Text weight="extrabold" color="#FFFFFF" style={s.couponHeadline}>{headline}</Text>
                {terms ? <Text variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1}>{terms}</Text> : null}
              </View>
              <View style={s.couponCode}><Text variant="caption" weight="bold" color="#FFFFFF" style={s.couponCodeText}>{p.code}</Text></View>
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
  state: 'active' | 'completed' | 'closed';
  onPress: () => void;
}

export function BookAgainList({ items, busyId, onRebook, onViewAll }: {
  items: { id: string; title: string; date?: string; code: string }[];
  busyId: string | null; onRebook: (id: string) => void; onViewAll: () => void;
}) {
  if (!items.length) return null;
  return (
    <View>
      <SectionHead title="Book again" action="View all" onAction={onViewAll} />
      <View style={s.list}>
        {items.map((it, i) => (
          <View key={it.id} style={[s.listRow, i > 0 && s.listDivider]}>
            <View style={s.rebookArt}><ServiceIllustration name={illustrationFor({ code: it.code })} size={32} /></View>
            <View style={s.flex}>
              <Text variant="bodySmall" weight="semibold" color={ink[900]} numberOfLines={1}>{it.title}</Text>
              <Text variant="caption" color={ink[500]}>{it.date ? `Last booked · ${fmtDay(it.date)}` : 'Booked before'}</Text>
            </View>
            <ScalePressable onPress={() => onRebook(it.id)} disabled={Boolean(busyId)} style={[s.outlineBtn, busyId && s.disabled]}
              accessibilityRole="button" accessibilityLabel={`Book ${it.title} again`}>
              <Text variant="caption" weight="bold" color={brand[700]}>{busyId === it.id ? 'Booking…' : 'Book again'}</Text>
            </ScalePressable>
          </View>
        ))}
      </View>
    </View>
  );
}

export function RecentActivity({ items, onViewAll }: { items: ActivityItem[]; onViewAll: () => void }) {
  if (!items.length) return null;
  return (
    <View>
      <SectionHead title="Your recent activity" action="All bookings" onAction={onViewAll} />
      <View style={s.list}>
        {items.map((it, i) => {
          const Icon = it.state === 'active' ? Clock : it.state === 'completed' ? CheckCircle2 : XCircle;
          const tone = it.state === 'active' ? brand[600] : it.state === 'completed' ? successInk : ink[400];
          const bg = it.state === 'active' ? brand[50] : it.state === 'completed' ? '#F0FDF4' : surface.sunken;
          return (
            <ScalePressable key={it.id} onPress={it.onPress} style={[s.listRow, i > 0 && s.listDivider]} accessibilityRole="button"
              accessibilityLabel={`${it.title}. ${it.subtitle}`}>
              <View style={[s.activityIcon, { backgroundColor: bg }]}><Icon size={18} color={tone} /></View>
              <View style={s.flex}>
                <Text variant="bodySmall" weight="semibold" color={ink[900]} numberOfLines={1}>{it.title}</Text>
                <Text variant="caption" color={ink[500]} numberOfLines={1}>{it.subtitle}</Text>
              </View>
              <ChevronRight size={18} color={ink[300]} />
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
  bleed: { marginHorizontal: -20 },
  railContent: { paddingHorizontal: 20, gap: 12, paddingBottom: 2 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1 },
  sectionTitle: { fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },

  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, minHeight: 28, alignSelf: 'flex-start', maxWidth: '100%' },
  roundBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: brand[100],
  },
  profileBtn: { backgroundColor: brand[50] },
  badge: {
    position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: '#F43F5E', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12 },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 26, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: surface.line,
  },

  switch: {
    flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: brand[50], borderWidth: 1, borderColor: brand[100],
  },
  switchItem: { flex: 1, height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  switchActive: { backgroundColor: brand[600] },

  hero: { borderRadius: brandRadius.hero, overflow: 'hidden', backgroundColor: brand[800] },
  banner: { overflow: 'hidden', justifyContent: 'center' },
  catalogSlide: { backgroundColor: brand[700] },
  catalogArt: { position: 'absolute', right: 8, bottom: 0, top: 0, justifyContent: 'center' },
  bannerText: { paddingHorizontal: 16, paddingVertical: 14 },
  bannerBadge: { alignSelf: 'flex-start', borderRadius: brandRadius.chip, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
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
  eyebrow: { letterSpacing: 1, marginBottom: 2 },
  dots: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { width: 22, backgroundColor: '#FFFFFF' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, justifyContent: 'space-between' },
  tile: { alignItems: 'center', gap: 6 },
  tileArt: { borderRadius: brandRadius.tile, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileLabel: { textAlign: 'center', fontSize: 12, lineHeight: 15 },

  promo: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: brandRadius.hero,
    backgroundColor: '#EEF0FF', borderWidth: 1, borderColor: brand[100],
  },
  promoTitle: { fontSize: 17, lineHeight: 21, letterSpacing: -0.2 },
  promoMark: { marginTop: 2, alignSelf: 'flex-start' },
  promoBody: { marginTop: 4, lineHeight: 17 },
  promoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10,
    backgroundColor: brand[600], borderRadius: 20, height: 40, paddingHorizontal: 16,
  },

  card: { width: 220, borderRadius: brandRadius.card, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: surface.line, overflow: 'hidden' },
  cardMedia: { height: 124, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardBody: { padding: 12, gap: 4 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  mediaChip: {
    position: 'absolute', left: 10, top: 10, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  skelLine: { height: 12, width: '75%', borderRadius: 6, backgroundColor: surface.sunken, marginTop: 4 },

  emptyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: brandRadius.card,
    borderWidth: 1, borderStyle: 'dashed', borderColor: surface.lineStrong, backgroundColor: '#FFFFFF',
  },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },

  coupon: { width: 260, height: 132, borderRadius: brandRadius.card, padding: 16, justifyContent: 'space-between', overflow: 'hidden' },
  couponHeadline: { fontSize: 24, lineHeight: 28, letterSpacing: -0.5, marginTop: 2 },
  couponCode: { alignSelf: 'flex-start', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.7)', borderRadius: brandRadius.chip, paddingHorizontal: 8, paddingVertical: 2 },
  couponCodeText: { letterSpacing: 1.5 },

  list: { borderRadius: brandRadius.card, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: surface.line, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 64 },
  listDivider: { borderTopWidth: 1, borderTopColor: surface.line },
  rebookArt: { width: 48, height: 48, borderRadius: 12, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },
  outlineBtn: { borderWidth: 1, borderColor: brand[200], borderRadius: 18, height: 36, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  activityIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
