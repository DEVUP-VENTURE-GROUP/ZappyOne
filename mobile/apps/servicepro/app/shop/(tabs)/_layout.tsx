import { useT } from '@zappy/ui/lib/i18n';
import { ProfileGate } from '../../../src/components/ProfileGate';
import { Tabs } from 'expo-router';
import { IndianRupee, LayoutDashboard, Menu, Store, Users, Wrench } from 'lucide-react-native';
import { colors } from '@zappy/ui/theme/colors';

/** The owner's bottom bar, the same six as the website (shared OWNER_PAGES): five daily pages and More for the rest. */
export default function ShopTabs() {
  const t = useT();
  return (
    <ProfileGate>
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: { fontFamily: 'Figtree-Bold', fontSize: 10.5 },
      tabBarItemStyle: { paddingHorizontal: 0 },
      tabBarHideOnKeyboard: true,
    }}>
      <Tabs.Screen name="index" options={{ title: t('sp.home', 'Home'), tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="work" options={{ title: t('sp.work', 'Work'), tabBarIcon: ({ color, size }) => <Wrench color={color} size={size} /> }} />
      <Tabs.Screen name="workers" options={{ title: t('sp.team', 'Team'), tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="earnings" options={{ title: t('sp.earnings', 'Earnings'), tabBarIcon: ({ color, size }) => <IndianRupee color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('sp.shop', 'Shop'), tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: t('sp.more', 'More'), tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }} />
      {/* Reached from the bell at the top of each home. */}
      <Tabs.Screen name="notifications" options={{ title: t('sp.alerts', 'Alerts'), href: null }} />
    </Tabs>
    </ProfileGate>
  );
}
