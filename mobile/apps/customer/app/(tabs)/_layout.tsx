import { Tabs } from 'expo-router';
import { Home, LayoutGrid, User } from 'lucide-react-native';
import { colors } from '@zappy/ui/theme/colors';

/**
 * The website's bottom bar on a phone (BottomNav): Home, Services, Bookings,
 * Track, Profile. Bookings and Track join as their screens are ported.
 */
export default function CustomerTabs() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: { fontFamily: 'Figtree-Bold', fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="services" options={{ title: 'Services', tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}
