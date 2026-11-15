/**
 * The top of Home, the way people read Blinkit, Zepto and Swiggy (the
 * website's HomeHeader): where the pro will come to (bold, tappable), the
 * notifications bell or Sign in, and the search bar pinned below.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Bell, ChevronDown, MapPin, ScanLine, Search, UserRound } from 'lucide-react-native';
import { Button, Text, ZappyWordmark } from '@zappy/ui/components';
import { accent, danger, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { GlassSurface, LIQUID_GLASS } from '@zappy/ui/components/Glass';
import { useUnread } from './useUnread';

export interface HomeLocation { primary: string; secondary: string | null; loading: boolean; lat?: number; lng?: number }

/** Rotating hint made of real, bookable problems. */
function SearchHint({ terms }: { terms: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (terms.length < 2) return undefined;
    const id = setInterval(() => setI((x) => (x + 1) % terms.length), 2600);
    return () => clearInterval(id);
  }, [terms.length]);
  const term = terms[i % Math.max(terms.length, 1)];
  return (
    <View style={styles.hint}>
      <Animated.View key={term || 'default'} entering={FadeInDown.duration(300)} exiting={FadeOutUp.duration(200)}>
        <Text variant="bodySmall" color={ink[500]} numberOfLines={1}>
          {term ? <>Search <Text variant="bodySmall" weight="semibold" color={ink[900]}>“{term}”</Text></> : 'Search for a service or problem'}
        </Text>
      </Animated.View>
    </View>
  );
}

export function SearchBar({ terms, onOpen, onLens }: { terms: string[]; onOpen: () => void; onLens?: () => void }) {
  return (
    <GlassSurface style={styles.searchShape} fallbackStyle={styles.search} interactive>
      <Pressable onPress={onOpen} accessibilityRole="search" accessibilityLabel="Search services" style={styles.searchTap}>
        <Search size={18} color={ink[500]} strokeWidth={2.4} />
        <SearchHint terms={terms} />
      </Pressable>
      {/* Only when photo search is set up on the server; never a button that fails. */}
      {onLens ? (
        <Pressable onPress={onLens} accessibilityRole="button" accessibilityLabel="Scan a photo to find the right service" hitSlop={6} style={styles.lens}>
          <ScanLine size={17} color={ink[500]} />
        </Pressable>
      ) : null}
    </GlassSurface>
  );
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Theme = any;

// The festive header line (the website's FestivePlace): greeting or arrival small, minutes or place large, in the festival's colours.
function FestivePlace({ theme, greeting, eta, closed, loc, onPickLocation }: { theme: Theme; greeting: string; eta: number | null; closed: string | null; loc: HomeLocation; onPickLocation: () => void }) {
  const timed = eta != null || Boolean(closed);
  return (
    <Pressable onPress={onPickLocation} accessibilityRole="button" accessibilityLabel={`${timed ? `${closed ? 'Pros are offline' : 'Pro at your door in'} ${closed || `${eta} minutes`}, at ` : ''}${loc.primary}. Change location`} style={styles.flex}>
      <Text variant="caption" weight="extrabold" color={theme.accent} style={styles.etaLabel}>{(closed ? 'Pros are offline' : eta != null ? 'Pro at your door in' : greeting || 'ZappyOne').toUpperCase()}</Text>
      <Text variant="heading1" weight="black" color={theme.ink} numberOfLines={1} style={styles.eta}>{closed || (eta != null ? `${eta} min` : loc.loading ? 'Finding you…' : loc.primary)}</Text>
      <View style={styles.loc}>
        <MapPin size={13} color={theme.accent} strokeWidth={2.4} />
        <Text variant="bodySmall" weight="bold" color={theme.ink} numberOfLines={1} style={styles.shrink}>
          {timed ? loc.primary : loc.secondary || 'Change location'}
          {timed && loc.secondary ? <Text variant="caption" color={theme.sub}>, {loc.secondary}</Text> : null}
        </Text>
        <ChevronDown size={14} color={theme.sub} strokeWidth={2.6} />
      </View>
    </Pressable>
  );
}

/** festive: the season's theme; the header takes its colour. */
export function HomeHeader({ loc, isAuthed, onPickLocation, tint = null, eta = null, festive = null, greeting = '', closed = null }: { loc: HomeLocation; isAuthed: boolean; onPickLocation: () => void; tint?: string | null; eta?: number | null; festive?: Theme; greeting?: string; closed?: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unread = useUnread(isAuthed);
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }, festive ? { backgroundColor: festive.top, overflow: 'hidden' } : tint ? { backgroundColor: tint } : null]}>
      {/* Blinkit's top: how soon someone can be at the door, big, with the address right under it. */}
      {festive ? <FestivePlace theme={festive} greeting={greeting} eta={eta} closed={closed} loc={loc} onPickLocation={onPickLocation} /> : (eta != null || closed) && !loc.loading ? (
        <Pressable onPress={onPickLocation} accessibilityRole="button" accessibilityLabel={`${closed ? 'Pros are offline' : 'Pro at your door in'} ${closed || `${eta} minutes`}, at ${loc.primary}. Change location`} style={styles.flex}>
          <Text variant="caption" weight="bold" color={closed ? accent[700] : ink[500]} style={styles.etaLabel}>{closed ? 'PROS ARE OFFLINE' : 'PRO AT YOUR DOOR IN'}</Text>
          <Text variant="heading1" weight="black" numberOfLines={1} style={styles.eta}>{closed || `${eta} min`}</Text>
          <View style={styles.loc}>
            <MapPin size={13} color={zappy[600]} strokeWidth={2.4} />
            <Text variant="bodySmall" weight="bold" color={zappy[700]} numberOfLines={1} style={styles.shrink}>{loc.primary}{loc.secondary ? <Text variant="caption" color={ink[500]}>, {loc.secondary}</Text> : null}</Text>
            <ChevronDown size={14} color={zappy[600]} strokeWidth={2.6} />
          </View>
        </Pressable>
      ) : (
      <View style={styles.flex}>
        <ZappyWordmark size={28} />
        {/* The area in bold, the city after it on the same line (Asif's top bar). */}
        <Pressable onPress={onPickLocation} accessibilityRole="button" accessibilityLabel={`Service location: ${loc.primary}. Change location`} style={styles.loc}>
          {loc.loading ? <ActivityIndicator size="small" color={zappy[600]} /> : <MapPin size={16} color={accent[500]} strokeWidth={2.4} />}
          <Text variant="body" color={ink[700]} numberOfLines={1} style={styles.shrink}>
            <Text variant="body" weight="extrabold" color={ink[900]}>{loc.loading ? 'Finding you…' : loc.primary}</Text>
            {!loc.loading && loc.secondary ? `, ${loc.secondary}` : ''}
          </Text>
          <ChevronDown size={16} color={zappy[600]} strokeWidth={2.6} />
        </Pressable>
      </View>
      )}
      {isAuthed ? (
        <GlassSurface style={styles.bellShape} fallbackStyle={styles.bell} interactive>
        <Pressable onPress={() => router.push('/notifications' as never)} accessibilityRole="button" accessibilityLabel={unread ? `${unread} unread notifications` : 'Notifications'} style={styles.bellShape}>
          <Bell size={17} color={zappy[700]} />
          {unread > 0 ? <View style={styles.badge}><Text variant="caption" weight="bold" color="#fff" style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
        </Pressable>
        </GlassSurface>
      ) : <Button label="Sign in" size="small" onPress={() => router.push('/(auth)/login' as never)} />}
      {isAuthed ? (
        <GlassSurface style={styles.bellShape} fallbackStyle={styles.bell} interactive>
          <Pressable onPress={() => router.push('/(tabs)/profile' as never)} accessibilityRole="button" accessibilityLabel="Your profile" style={styles.bellShape}>
            <UserRound size={18} color={zappy[700]} />
          </Pressable>
        </GlassSurface>
      ) : null}
    </View>
  );
}

// iOS 26 only: once the top bar scrolls away, the place and the bell float back in on glass (Asif's design); elsewhere nothing changes.
export function FloatingGlassHeader({ shown, loc, isAuthed, onPickLocation }: { shown: boolean; loc: HomeLocation; isAuthed: boolean; onPickLocation: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const unread = useUnread(isAuthed);
  if (!LIQUID_GLASS || !shown) return null;
  return (
    <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutUp.duration(150)} style={[styles.floatWrap, { top: insets.top + 6 }]} pointerEvents="box-none">
      <GlassSurface style={styles.floatBar} interactive>
        <Pressable onPress={onPickLocation} accessibilityRole="button" accessibilityLabel={`Service location: ${loc.primary}. Change location`} style={styles.floatLoc}>
          <MapPin size={15} color={zappy[600]} strokeWidth={2.4} />
          <Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.flex}>{loc.primary}</Text>
          <ChevronDown size={14} color={zappy[600]} strokeWidth={2.6} />
        </Pressable>
        {isAuthed ? (
          <Pressable onPress={() => router.push('/notifications' as never)} hitSlop={6} accessibilityRole="button" accessibilityLabel={unread ? `${unread} unread notifications` : 'Notifications'} style={styles.floatBell}>
            <Bell size={18} color={ink[900]} />
            {unread > 0 ? <View style={styles.badge}><Text variant="caption" weight="bold" color="#fff" style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
          </Pressable>
        ) : null}
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  shrink: { flexShrink: 1 },
  etaLabel: { letterSpacing: 1 },
  eta: { letterSpacing: -0.8, lineHeight: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.sm, backgroundColor: zappy[100] },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  bellShape: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  bell: { borderWidth: 1, borderColor: zappy[100], backgroundColor: '#fff' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: danger[500], borderWidth: 2, borderColor: '#fff' },
  badgeText: { fontSize: 10, lineHeight: 12 },
  searchShape: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, paddingLeft: spacing.md, paddingRight: 6, borderRadius: radius.button },
  search: { borderWidth: 1, borderColor: zappy[100], backgroundColor: '#fff' },
  searchTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: '100%' },
  hint: { flex: 1, overflow: 'hidden', justifyContent: 'center', height: '100%' },
  lens: { width: 36, height: 36, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: slate[200] },
  floatWrap: { position: 'absolute', left: spacing.base, right: spacing.base, zIndex: 20 },
  floatBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  floatLoc: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  floatBell: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
