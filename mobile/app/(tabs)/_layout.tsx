/**
 * Customer tab bar.
 * ----------------------------------------------------------------------------
 * The website's `.bottom-nav` is a FLOATING PILL:
 *
 *   fixed bottom-4 inset-x-4 bg-white/90 backdrop-blur-xl
 *   border border-slate-200/50 rounded-full
 *   shadow-[0_8px_32px_-4px_rgba(15,23,42,0.1)] max-w-md
 *
 * (verified in client/src/styles/index.css). That silhouette is one of the most
 * recognisable parts of the Zappy UI, so the native tab bar reproduces it
 * rather than the default docked rectangular bar.
 *
 * Tab order and screen names are UNCHANGED from upstream — this is a visual
 * change only; no navigation architecture is introduced or replaced.
 * ----------------------------------------------------------------------------
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  Home,
  MessageSquare,
  Search,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '../../components/ui/Text';
import { colors, zappy, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { sizes } from '../../theme/dimensions';

interface TabIconProps {
  Icon: LucideIcon;
  label: string;
  focused: boolean;
}

/**
 * Matches `.bottom-nav-item` — 10px semibold, slate-400 at rest, brand blue
 * when active. The active state is carried by BOTH colour and stroke weight,
 * so it never depends on colour alone.
 */
function TabIcon({ Icon, label, focused }: TabIconProps) {
  return (
    <View style={styles.item}>
      <Icon
        size={20}
        strokeWidth={focused ? 2.4 : 1.9}
        color={focused ? zappy[600] : slate[400]}
      />
      <Text
        variant="navLabel"
        color={focused ? zappy[600] : slate[400]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // Absolute positioning is what makes it read as floating rather than
        // docked — content scrolls beneath it.
        tabBarStyle: [
          styles.bar,
          {
            bottom: Math.max(insets.bottom, spacing.md),
            height: sizes.bottomNavHeight,
          },
        ],
        tabBarItemStyle: styles.barItem,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon Icon={Home} label="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Services',
          tabBarAccessibilityLabel: 'Services',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Search} label="Services" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarAccessibilityLabel: 'Bookings',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Calendar} label="Bookings" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chats',
          tabBarAccessibilityLabel: 'Chats',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={MessageSquare} label="Chats" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon Icon={User} label="Profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    ...shadows.softLarge,
  },
  barItem: {
    height: sizes.bottomNavHeight,
    paddingVertical: 0,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: sizes.bottomNavHeight,
    minWidth: 56,
  },
});
