import { View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { ClipboardList, Home, LayoutGrid, Store, User } from 'lucide-react-native';
import { LIQUID_GLASS } from '@zappy/ui/components/Glass';
import { useAppSelector } from '@zappy/core/store/hooks';
import { useUnread } from '../../src/features/home/useUnread';
import { useCurrentSeasonQuery } from '@zappy/core/api';
import useFestiveLook from '@zappy/core/shared/useFestiveLook';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { useT } from '@zappy/ui/lib/i18n';
import { JhalarEdge } from '../../src/features/home/festive/JhalarEdge';
import { SafeSection } from '@zappy/ui/components/common/SafeSection';
import { colors } from '@zappy/ui/theme/colors';
import { ActiveJobPill } from '../../src/features/home/ActiveJobPill';

// Apple's Liquid Glass tab bar on iOS 26+: same slots and order; Stores is disabled there so its press only opens the stores screen.
function GlassTabs({ unread }: { unread: number }) {
  const t = useT();
  const router = useRouter();
  return (
    <NativeTabs tintColor={colors.primary} screenListeners={({ route }) => ({ tabPress: () => { if (route.name === 'stores') router.push('/nearby-shops' as never); } })}>
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>{t('nav.home', 'Home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="services">
        <NativeTabs.Trigger.Label>{t('nav.services', 'Services')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stores" disabled>
        <NativeTabs.Trigger.Label>{t('nav.stores', 'Stores')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="storefront" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="orders">
        <NativeTabs.Trigger.Label>{t('nav.bookings', 'Bookings')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'list.clipboard', selected: 'list.clipboard.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{t('nav.profile', 'Profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} />
        {unread > 0 ? <NativeTabs.Trigger.Badge>{unread > 9 ? '9+' : String(unread)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// The website's bottom bar on a phone: Home, Services, Stores, Bookings, Profile; tracking opens from the live-job card and Bookings. A festival wears it lightly.
export default function CustomerTabs() {
  const t = useT();
  const router = useRouter();
  // The unread count hangs off Profile, as on the website's bar; same query as the Home bell.
  const isAuthed = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const unread = useUnread(isAuthed);
  const { data } = useCurrentSeasonQuery(undefined);
  const festive = useFestiveLook(data?.season?.theme, useReducedMotion());
  if (LIQUID_GLASS) return <View style={{ flex: 1 }}><GlassTabs unread={unread} /><ActiveJobPill /></View>;
  return (
    <View style={{ flex: 1 }}>
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
      <Tabs.Screen name="stores" options={{ title: t('nav.stores', 'Stores'), tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }}
        listeners={{ tabPress: (e) => { e.preventDefault(); router.push('/nearby-shops' as never); } }} />
      <Tabs.Screen name="orders" options={{ title: t('nav.bookings', 'Bookings'), tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
      <Tabs.Screen name="track" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: t('nav.profile', 'Profile'), tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined, tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
    <ActiveJobPill />
    </View>
  );
}
