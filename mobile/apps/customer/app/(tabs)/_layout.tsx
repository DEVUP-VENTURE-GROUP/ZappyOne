import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { ClipboardList, Home, LayoutGrid, MapPin, User } from 'lucide-react-native';
import { useCurrentSeasonQuery } from '@zappy/core/api';
import { themeOf } from '@zappy/core/shared/season';
import { useT } from '@zappy/ui/lib/i18n';
import { JhalarEdge } from '../../src/features/home/festive/JhalarEdge';
import { SafeSection } from '@zappy/ui/components/common/SafeSection';
import { colors } from '@zappy/ui/theme/colors';

/**
 * The website's bottom bar on a phone (BottomNav): Home, Services, Bookings,
 * Track, Profile, in the customer's language. During a festival it wears it
 * lightly: the festival's wash, a gold jhalar along the top, its accent.
 */
export default function CustomerTabs() {
  const t = useT();
  const { data } = useCurrentSeasonQuery(undefined);
  const festive = data?.season ? themeOf(data.season.theme) : null;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: festive ? festive.accent : colors.primary,
      ...(festive ? {
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: festive.wash }}>
            <SafeSection name="festive-tabbar"><JhalarEdge color={festive.dark ? festive.accent : festive.paint[4] || festive.accent} /></SafeSection>
          </View>
        ),
      } : {}),
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
