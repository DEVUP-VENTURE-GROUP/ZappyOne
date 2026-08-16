/**
 * Worker tab bar.
 * ----------------------------------------------------------------------------
 * Styled from the shared design tokens rather than hardcoded hex, so the pro
 * app reads as the same product as the customer app.
 *
 * The active tint was `#F97316`, commented "Zappy accent orange". That is not
 * the Zappy accent — the brand's amber is `#F59E0B` (`accent[500]`), and
 * `#F97316` was explicitly ruled out during the design-system work. Amber
 * rather than blue is still the right call here: earnings lead the pro
 * experience, and it keeps the two apps distinguishable at a glance without
 * leaving the palette.
 * ----------------------------------------------------------------------------
 */

import { Tabs } from 'expo-router';
import { useJobOffers } from '../../../hooks/useJobOffers';
import { Briefcase, Home, User, Wallet } from 'lucide-react-native';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';

export default function WorkerTabsLayout() {
  // Mounted here, not on a screen: an offer arriving while the pro is looking
  // at another tab must still be captured. Feeds `offersSlice`.
  useJobOffers();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontFamily: typography.navLabel.fontFamily,
          fontSize: typography.navLabel.fontSize,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="offers"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => <Briefcase size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarIcon: ({ color }) => <Wallet size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
