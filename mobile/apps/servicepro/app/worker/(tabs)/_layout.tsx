import { Tabs } from 'expo-router';
import { Bell, LayoutDashboard, ShieldCheck, UserRound } from 'lucide-react-native';
import { colors } from '@zappy/ui/theme/colors';

/** A shop technician's bottom bar (the website's TECHNICIAN_PAGES): home, alerts, profile, ID check. */
export default function TechnicianTabs() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: { fontFamily: 'Figtree-Bold', fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts', tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
      <Tabs.Screen name="kyc" options={{ title: 'ID check', tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} /> }} />
    </Tabs>
  );
}
