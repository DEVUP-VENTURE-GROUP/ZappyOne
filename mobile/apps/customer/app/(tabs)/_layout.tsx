import { Tabs } from 'expo-router';
import { ClipboardList, Home, LayoutGrid, MapPin, User } from 'lucide-react-native';
import { useT } from '@zappy/ui/lib/i18n';
import { colors } from '@zappy/ui/theme/colors';

/**
 * The website's bottom bar on a phone (BottomNav): Home, Services, Bookings,
 * Track, Profile, in the customer's language.
 */
export default function CustomerTabs() {
  const t = useT();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: { fontFamily: 'Figtree-Bold', fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: t('nav.home', 'Home'), tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="services" options={{ title: t('nav.services', 'Services'), tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }} />
      <Tabs.Screen name="orders" options={{ title: t('nav.bookings', 'Bookings'), tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
      <Tabs.Screen name="track" options={{ title: t('nav.track', 'Track'), tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('nav.profile', 'Profile'), tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}
