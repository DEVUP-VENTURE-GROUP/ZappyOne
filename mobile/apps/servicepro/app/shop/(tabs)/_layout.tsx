import { Tabs } from 'expo-router';
import { Bell, IndianRupee, LayoutDashboard, UserRound, Users } from 'lucide-react-native';
import { colors } from '@zappy/ui/theme/colors';

/** The owner's bottom bar: the places a shop owner goes every day (the rest are in the menu). */
export default function ShopTabs() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: { fontFamily: 'Figtree-Bold', fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="workers" options={{ title: 'Team', tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color, size }) => <IndianRupee color={color} size={size} /> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts', tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
