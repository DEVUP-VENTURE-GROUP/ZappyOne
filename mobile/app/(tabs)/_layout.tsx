/**
 * Customer tab bar.
 * ----------------------------------------------------------------------------
 * Matches the website's bottom nav: five slots — Home, Bookings, a raised
 * Book Now disc, Track, Profile — on a white bar with rounded top corners.
 *
 * ── WHY A CUSTOM BAR ───────────────────────────────────────────────────────
 * The centre disc has to overflow ABOVE the bar and carry its own label. A
 * stock `tabBarIcon` is clipped to its slot, so the raised button is only
 * possible with a custom `tabBar`. Everything else — routing, focus state,
 * accessibility roles — still comes from React Navigation's descriptors; this
 * only draws them.
 *
 * ── ROUTES ─────────────────────────────────────────────────────────────────
 * Book Now is an ACTION, not a tab: it pushes the services catalogue, which is
 * where a booking actually starts. `services` and `chat` therefore stay
 * registered but hidden (`href: null`) — both are still reached from Home,
 * category tiles and the tracking screen, and dropping their files would break
 * those links.
 *
 * `track` is a new screen that resolves the customer's active order and
 * forwards to `/tracking/order/[id]`; see it for why it exists.
 * ----------------------------------------------------------------------------
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ClipboardList,
  Home,
  MapPin,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '../../components/ui/Text';
import { useAppSelector } from '../../store/hooks';
import {
  BOOK_NOW_LIFT,
  BookNowButton,
} from '../../components/navigation/BookNowButton';
import { colors, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';

/** The four real tabs, in bar order. Book Now is injected between 2 and 3. */
const ITEMS: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: 'home', label: 'Home', Icon: Home },
  { name: 'bookings', label: 'Bookings', Icon: ClipboardList },
  { name: 'track', label: 'Track', Icon: MapPin },
  { name: 'profile', label: 'Profile', Icon: User },
];

const BAR_HEIGHT = 62;

/**
 * `@react-navigation/bottom-tabs` is not a direct dependency — expo-router
 * bundles it under `build/`. Deriving the prop type from `Tabs` itself keeps
 * this correct without importing through a build path that could move between
 * router versions.
 */
type TabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const renderItem = (item: (typeof ITEMS)[number]) => {
    const routeIndex = state.routes.findIndex((r: { name: string }) => r.name === item.name);
    const focused = state.index === routeIndex;
    const { Icon } = item;

    const onPress = () => {
      const route = state.routes[routeIndex];
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      // Respect a screen that wants to handle the press itself.
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name as never);
      }
    };

    return (
      <Pressable
        key={item.name}
        onPress={onPress}
        style={styles.slot}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={item.label}
      >
        {/* Active state is carried by colour AND stroke weight, never colour
            alone. */}
        <Icon
          size={22}
          strokeWidth={focused ? 2.4 : 1.9}
          color={focused ? zappy[600] : slate[400]}
        />
        <Text
          variant="navLabel"
          color={focused ? zappy[600] : slate[400]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: insets.bottom, height: BAR_HEIGHT + insets.bottom },
      ]}
    >
      {renderItem(ITEMS[0])}
      {renderItem(ITEMS[1])}

      <BookNowButton
        barHeight={BAR_HEIGHT}
        onPress={() => router.push('/(tabs)/services')}
      />

      {renderItem(ITEMS[2])}
      {renderItem(ITEMS[3])}
    </View>
  );
}

export default function TabsLayout() {
  /**
   * Don't mount the customer tabs without a session.
   *
   * The root guard redirects an unauthenticated user to /login, but that runs
   * in an effect — it commits one frame AFTER this subtree has already
   * rendered. In that frame Home mounts and fires its authenticated queries
   * (wallet, rewards, notifications), which all 401. Opening the app straight
   * onto a protected URL therefore logged a burst of 401s before the redirect
   * landed.
   *
   * Rendering nothing for that single frame costs nothing visually — the
   * redirect is already on its way — and the requests are never made.
   */
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  if (!isAuthenticated) return null;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="track" options={{ title: 'Track' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />

      {/* Registered but not in the bar — still reachable by route. */}
      <Tabs.Screen name="services" options={{ href: null, title: 'Services' }} />
      <Tabs.Screen name="chat" options={{ href: null, title: 'Chats' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.large,
    borderTopRightRadius: radius.large,
    paddingHorizontal: spacing.xs,
    // The disc overflows upward, so the bar must not clip its children.
    overflow: 'visible',
    ...shadows.softLarge,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: BAR_HEIGHT,
  },
});

/** Exported so screens can clear the raised disc when padding their content. */
export const TAB_BAR_LIFT = BOOK_NOW_LIFT;
