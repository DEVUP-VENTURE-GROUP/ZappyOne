/**
 * Events and décor (the website's EventsHomePage): search, browse by occasion,
 * and what is trending. Saved themes and bookings are one tap away.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpRight, CalendarCheck, Heart, PartyPopper, Search, TrendingUp } from 'lucide-react-native';
import { useGetEventCategoriesQuery, useGetEventConfigQuery, useGetEventThemesQuery } from '@zappy/core/api';
import { EmptyState, ScreenHeader, Skeleton, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, danger, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { OccasionTile, type Occasion } from './OccasionTile';
import { ThemeCard, type Theme } from './ThemeCard';
import { useSaveTheme } from './useSaveTheme';

const FALLBACK: Occasion[] = [{ name: 'Birthday' }, { name: 'Baby Shower' }, { name: 'Anniversary' }, { name: 'Housewarming' }, { name: 'Romantic' }];
const browse = (occ: Occasion) => `/events/browse?category=${encodeURIComponent(occ.slug || occ.name.toLowerCase())}`;

export function EventsHomePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [search, setSearch] = useState('');
  const { data: cats } = useGetEventCategoriesQuery(undefined);
  const { data: config } = useGetEventConfigQuery(undefined);
  const { data: trending, isLoading } = useGetEventThemesQuery({ sort: 'trending', limit: 12 });
  const save = useSaveTheme();
  const occasions: Occasion[] = (cats?.categories?.length ? cats.categories : FALLBACK).slice(0, 5);
  const themes: Theme[] = trending?.themes || [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));
  const submit = () => { if (search.trim()) router.push(`/events/browse?search=${encodeURIComponent(search.trim())}` as never); };

  if ((config as { live?: boolean } | undefined)?.live === false) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <ScreenHeader title={t('events.title', 'Events')} onBack={back} />
        <EmptyState icon={<PartyPopper size={44} color={slate[300]} />} title={t('events.paused', 'Events are not open right now')}
          message={t('events.pausedHint', 'Event décor bookings are paused for the moment. Your existing bookings carry on as planned.')} />
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('events.title', 'Events and décor')} onBack={back}
        right={(
          <View style={styles.headActions}>
            <Pressable onPress={() => router.push('/events/saved' as never)} accessibilityRole="button" accessibilityLabel={t('events.saved', 'Saved themes')} hitSlop={6} style={styles.headBtn}><Heart size={18} color={ink[700]} /></Pressable>
            <Pressable onPress={() => router.push('/events/bookings' as never)} accessibilityRole="button" accessibilityLabel={t('events.myBookings', 'My event bookings')} hitSlop={6} style={styles.headBtn}><CalendarCheck size={18} color={ink[700]} /></Pressable>
          </View>
        )} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <Text variant="bodySmall" color={ink[500]}>{t('events.intro', 'Decor and planning for birthdays, showers, anniversaries and more.')}</Text>
        <View style={styles.search}>
          <Search size={18} color={ink[500]} />
          <TextInput value={search} onChangeText={setSearch} onSubmitEditing={submit} returnKeyType="search" placeholder={t('events.searchHint', 'Birthday, anniversary, baby shower')} placeholderTextColor={ink[400]} style={styles.input} />
        </View>

        <View style={styles.head}>
          <Text variant="heading3" weight="black">{t('events.byOccasion', 'Browse by occasion')}</Text>
          <Pressable onPress={() => router.push('/events/browse' as never)} accessibilityRole="button" style={styles.link}><Text variant="bodySmall" weight="bold" color={danger[600]}>{t('events.all', 'Explore all')}</Text><ArrowUpRight size={16} color={danger[600]} /></Pressable>
        </View>
        <View style={styles.grid}>
          {occasions.map((o, i) => <OccasionTile key={o._id || o.name} occasion={o} big={i === 0} onPress={() => router.push(browse(o) as never)} />)}
        </View>

        <View style={styles.head}>
          <View style={styles.link}><TrendingUp size={18} color={ink[700]} /><Text variant="heading3" weight="black">{t('events.trending', 'Trending now')}</Text></View>
          <Pressable onPress={() => router.push('/events/browse?sort=trending' as never)} accessibilityRole="button" style={styles.link}><Text variant="bodySmall" weight="bold" color={danger[600]}>{t('events.seeAll', 'See all')}</Text><ArrowUpRight size={16} color={danger[600]} /></Pressable>
        </View>
        {isLoading ? [0, 1].map((i) => <Skeleton key={i} height={280} borderRadius={radius.large} />)
          : themes.length ? themes.map((th) => <ThemeCard key={th._id} theme={th} onSave={save} />)
            : <EmptyState icon={<PartyPopper size={44} color={slate[300]} />} title={t('events.noThemes', 'No themes yet. Check back soon!')} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  headActions: { flexDirection: 'row', gap: 4 },
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, height: 48, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: slate[50] },
  input: { flex: 1, color: ink[900], fontFamily: 'Figtree-Regular', fontSize: 15 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
