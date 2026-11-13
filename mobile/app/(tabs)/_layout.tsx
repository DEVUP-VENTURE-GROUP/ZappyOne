/**
 * Customer tab bar.
 * ----------------------------------------------------------------------------
 * Matches the website's bottom nav: Home, Services, Stores, Bookings,
 * Profile — five even slots on a white bar, in the brand blue (theme/brand.ts).
 *
 * ── WHY A CUSTOM BAR ───────────────────────────────────────────────────────
 * Stores is not a tab route: it opens the existing `/shops` stack screen. A
 * custom `tabBar` lets one slot be an action while the rest stay real tabs —
 * routing, focus state and accessibility roles still come from the
 * navigator's descriptors; this only draws them.
 *
 * ── ROUTES ─────────────────────────────────────────────────────────────────
 * `track` and `chat` stay registered but hidden (`href: null`): Track is
 * reached from the live-booking card on Home and from Bookings, chat from the
 * tracking screen, and dropping their files would break those links.
 * `track` resolves the customer's active order and forwards to
 * `/tracking/order/[id]`.
 * ----------------------------------------------------------------------------
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ClipboardList,
  Home,
  LayoutGrid,
  Store,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '../../components/ui/Text';
import { useAppSelector } from '../../store/hooks';
import { useListNotificationsQuery } from '../../services/api/notificationsApi';
import { colors, danger, slate } from '../../theme/colors';
import { brand } from '../../theme/brand';
import { spacing } from '../../theme/spacing';

/**
 * Bar order — the website's bottom nav: Home, Services, Stores, Bookings,
 * Profile. Stores opens the existing `/shops` screen (a stack screen, not a
 * tab), so it carries `href` instead of a route name. Live tracking is reached
 * from the live-booking card on Home and from Bookings.
 */
const ITEMS: { name: string; label: string; Icon: LucideIcon; href?: string }[] = [
  { name: 'home', label: 'Home', Icon: Home },
  { name: 'services', label: 'Services', Icon: LayoutGrid },
  { name: 'stores', label: 'Stores', Icon: Store, href: '/shops' },
  { name: 'bookings', label: 'Bookings', Icon: ClipboardList },
  { name: 'profile', label: 'Profile', Icon: User },
];

/** `h-[calc(64px+env(safe-area-inset-bottom))]` on the web nav. */
const BAR_HEIGHT = 64;

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

  // The web nav hangs the unread count off the PROFILE tab, not a bell.
  const { data: notifications } = useListNotificationsQuery();
  const unread = notifications?.unread ?? 0;

  const renderItem = (item: (typeof ITEMS)[number]) => {
    const routeIndex = state.routes.findIndex((r: { name: string }) => r.name === item.name);
    const focused = routeIndex >= 0 && state.index === routeIndex;
    const { Icon } = item;

    const onPress = () => {
      if (item.href) {
        router.push(item.href as never);
        return;
      }
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
        <View>
          <Icon
            size={22}
            strokeWidth={focused ? 2.5 : 2}
            color={focused ? brand[600] : slate[400]}
          />
          {item.name === 'profile' && unread > 0 ? (
            <View style={styles.badge}>
              <Text variant="caption" color={colors.textInverse} style={styles.badgeText}>
                {unread > 9 ? '9+' : unread}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          variant="navLabel"
          color={focused ? brand[600] : slate[400]}
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
      {ITEMS.map(renderItem)}
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
      <Tabs.Screen name="services" options={{ title: 'Services' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />

      {/* Registered but not in the bar — still reachable by route. */}
      <Tabs.Screen name="track" options={{ href: null, title: 'Track' }} />
      <Tabs.Screen name="chat" options={{ href: null, title: 'Chats' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    // Square corners and a top border, matching the live BottomNav.jsx. The
    // rounded floating pill in the site's index.css (`.bottom-nav`) is dead
    // CSS — no component references it.
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xs,
    // The disc overflows upward, so the bar must not clip its children.
    overflow: 'visible',
    // `shadow-[0_-2px_12px_rgba(20,21,42,0.06)]` — cast UPWARD.
    ...Platform.select({
      ios: {
        shadowColor: '#14152A',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  // `-top-1.5 -right-2 min-w-[16px] h-[16px] bg-rose-500 ring-2 ring-white`.
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: danger[500],
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 9, lineHeight: 11 },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: BAR_HEIGHT,
  },
});
