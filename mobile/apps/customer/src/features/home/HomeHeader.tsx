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
import { Bell, ChevronDown, MapPin, ScanLine, Search } from 'lucide-react-native';
import { useListNotificationsQuery } from '@zappy/core/api';
import { Button, Text, ZappyWordmark } from '@zappy/ui/components';
import { accent, danger, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

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
    <View style={styles.search}>
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
    </View>
  );
}

function useUnread(isAuthed: boolean) {
  const { data } = useListNotificationsQuery({ page: 1, unreadOnly: true }, { skip: !isAuthed, pollingInterval: 60000 });
  return data?.unread ?? data?.notifications?.length ?? 0;
}

/** tint: a light festive season's colour, so the festive top flows out of the header. */
export function HomeHeader({ loc, isAuthed, onPickLocation, tint = null }: { loc: HomeLocation; isAuthed: boolean; onPickLocation: () => void; tint?: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unread = useUnread(isAuthed);
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }, tint ? { backgroundColor: tint } : null]}>
      <View style={styles.flex}>
        <ZappyWordmark size={22} />
        <Pressable onPress={onPickLocation} accessibilityRole="button" accessibilityLabel={`Service location: ${loc.primary}. Change location`} style={styles.loc}>
          {loc.loading ? <ActivityIndicator size="small" color={zappy[600]} /> : <MapPin size={16} color={accent[500]} strokeWidth={2.4} />}
          <Text variant="body" weight="extrabold" color={zappy[700]} numberOfLines={1} style={styles.shrink}>{loc.loading ? 'Finding you…' : loc.primary}</Text>
          <ChevronDown size={16} color={zappy[600]} strokeWidth={2.6} />
        </Pressable>
        {!loc.loading && loc.secondary ? <Text variant="caption" color={ink[500]} numberOfLines={1}>{loc.secondary}</Text> : null}
      </View>
      {isAuthed ? (
        <Pressable onPress={() => router.push('/notifications' as never)} accessibilityRole="button" accessibilityLabel={unread ? `${unread} unread notifications` : 'Notifications'} style={styles.bell}>
          <Bell size={17} color={zappy[700]} />
          {unread > 0 ? <View style={styles.badge}><Text variant="caption" weight="bold" color="#fff" style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
        </Pressable>
      ) : <Button label="Sign in" size="small" onPress={() => router.push('/(auth)/login' as never)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  shrink: { flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.sm, backgroundColor: zappy[100] },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  bell: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: zappy[100], backgroundColor: '#fff' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: danger[500], borderWidth: 2, borderColor: '#fff' },
  badgeText: { fontSize: 10, lineHeight: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, paddingLeft: spacing.md, paddingRight: 6, borderRadius: radius.button, borderWidth: 1, borderColor: zappy[100], backgroundColor: '#fff' },
  searchTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: '100%' },
  hint: { flex: 1, overflow: 'hidden', justifyContent: 'center', height: '100%' },
  lens: { width: 36, height: 36, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: slate[200] },
});
