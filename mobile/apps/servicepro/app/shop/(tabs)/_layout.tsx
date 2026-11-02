import { useT } from '@zappy/ui/lib/i18n';
import { ProfileGate } from '../../../src/components/ProfileGate';
import { Tabs } from 'expo-router';
import { IndianRupee, LayoutDashboard, UserRound, Users } from 'lucide-react-native';
import { colors } from '@zappy/ui/theme/colors';

/** The owner's bottom bar: the places a shop owner goes every day (the rest are in the menu). */
export default function ShopTabs() {
  const t = useT();
  return (
    <ProfileGate>
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: { fontFamily: 'Figtree-Bold', fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: t('sp.home', 'Home'), tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="workers" options={{ title: t('sp.team', 'Team'), tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="earnings" options={{ title: t('sp.earnings', 'Earnings'), tabBarIcon: ({ color, size }) => <IndianRupee color={color} size={size} /> }} />
      {/* Reached from the bell at the top of each home. */}
      <Tabs.Screen name="notifications" options={{ title: t('sp.alerts', 'Alerts'), href: null }} />
      <Tabs.Screen name="account" options={{ title: t('sp.profile', 'Profile'), tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
    </ProfileGate>
  );
}
