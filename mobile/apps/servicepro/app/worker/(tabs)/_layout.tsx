import { useT } from '@zappy/ui/lib/i18n';
import { ProfileGate } from '../../../src/components/ProfileGate';
import { Tabs } from 'expo-router';
import { LayoutDashboard, ShieldCheck, UserRound } from 'lucide-react-native';
import { colors } from '@zappy/ui/theme/colors';

/** A shop technician's bottom bar (the website's TECHNICIAN_PAGES): home, alerts, profile, ID check. */
export default function TechnicianTabs() {
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
      {/* Reached from the bell at the top of each home. */}
      <Tabs.Screen name="notifications" options={{ title: t('sp.alerts', 'Alerts'), href: null }} />
      <Tabs.Screen name="profile" options={{ title: t('sp.profile', 'Profile'), tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
      <Tabs.Screen name="kyc" options={{ title: t('sp.id_check', 'ID check'), tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} /> }} />
    </Tabs>
    </ProfileGate>
  );
}
