import { useT } from '@zappy/ui/lib/i18n';
import { ProfileGate } from '../../../src/components/ProfileGate';
import { Tabs } from 'expo-router';
import { CalendarCheck, CalendarDays, Images, LayoutDashboard, UserRound } from 'lucide-react-native';
import { colors } from '@zappy/ui/theme/colors';

/** The event partner's bottom bar (the events website's PartnerShell): the places they go every day; the rest are on Profile. */
export default function PartnerTabs() {
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
      <Tabs.Screen name="bookings" options={{ title: t('sp.bookings', 'Bookings'), tabBarIcon: ({ color, size }) => <CalendarCheck color={color} size={size} /> }} />
      <Tabs.Screen name="packages" options={{ title: t('sp.packages', 'Packages'), tabBarIcon: ({ color, size }) => <Images color={color} size={size} /> }} />
      <Tabs.Screen name="calendar" options={{ title: t('sp.calendar', 'Calendar'), tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: t('sp.profile', 'Profile'), tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
    </ProfileGate>
  );
}
