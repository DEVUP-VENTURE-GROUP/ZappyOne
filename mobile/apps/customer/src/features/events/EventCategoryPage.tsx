/**
 * Browse décor themes (the website's EventCategoryPage): by occasion or a
 * search, sorted the way the customer picks, filtered by budget, guests and
 * city, a page at a time.
 */
import { useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, SearchX, SlidersHorizontal, X } from 'lucide-react-native';
import { useGetEventCategoriesQuery, useGetEventThemesQuery } from '@zappy/core/api';
import { Button, Chip, EmptyState, Input, Skeleton, Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, danger, ink, navy, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { eventPhoto } from './eventTones';
import type { Occasion } from './OccasionTile';
import { ThemeCard, type Theme } from './ThemeCard';
import { useSaveTheme } from './useSaveTheme';

const SORTS: [string, string][] = [['trending', 'Trending'], ['rating', 'Top rated'], ['price_asc', '₹ Low to high'], ['price_desc', '₹ High to low'], ['newest', 'Newest']];

export function EventCategoryPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const params = useLocalSearchParams<{ category?: string; search?: string; sort?: string }>();
  const category = params.category || '';
  const searchQ = params.search || '';
  const [sort, setSort] = useState(params.sort || 'trending');
  const [budgetMax, setBudgetMax] = useState('');
  const [guests, setGuests] = useState('');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const save = useSaveTheme();

  const { data, isLoading } = useGetEventThemesQuery({
    category: category || undefined, sort, page, search: searchQ || undefined,
    budgetMax: budgetMax ? Number(budgetMax) * 100 : undefined, guestCount: guests ? Number(guests) : undefined, city: city || undefined,
  });
  const { data: cats } = useGetEventCategoriesQuery(undefined);
  const cat: Occasion | undefined = cats?.categories?.find((c: Occasion) => c.slug === category);
  const hero = (category || searchQ) ? webAsset(eventPhoto(cat || { name: category })) : null;
  const title = cat ? cat.name : searchQ ? `"${searchQ}"` : t('events.explore', 'Explore events');
  const themes: Theme[] = data?.themes || [];
  const clear = () => { setBudgetMax(''); setGuests(''); setCity(''); setPage(1); };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/events' as never));

  const header = (
    <View style={styles.gap}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}>
        {hero ? <Image source={{ uri: hero }} style={[StyleSheet.absoluteFill, styles.dim]} /> : null}
        <View style={styles.nav}>
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={styles.round}><ArrowLeft size={20} color="#fff" /></Pressable>
          <Pressable onPress={() => setShowFilter((v) => !v)} accessibilityRole="button" style={[styles.filterBtn, showFilter && styles.filterOn]}>
            <SlidersHorizontal size={16} color={showFilter ? ink[900] : '#fff'} /><Text variant="caption" weight="bold" color={showFilter ? ink[900] : '#fff'}>{t('events.filters', 'Filters')}</Text>
          </Pressable>
        </View>
        <Text variant="caption" weight="black" color="rgba(255,255,255,0.8)">{searchQ ? t('events.results', 'SEARCH RESULTS') : t('events.category', 'CATEGORY')}</Text>
        <Text variant="display" weight="black" color="#fff">{title}</Text>
        <Text variant="bodySmall" weight="semibold" color="rgba(255,255,255,0.9)">{data?.total || 0} {t('events.available', 'themes available')}</Text>
      </View>
      <View style={styles.pad}>
        {showFilter ? (
          <View style={styles.filters}>
            <Input label={t('events.budget', 'Max budget (₹)')} value={budgetMax} onChangeText={(v) => { setBudgetMax(v.replace(/\D/g, '')); setPage(1); }} keyboardType="number-pad" placeholder="e.g. 5000" />
            <Input label={t('events.guests', 'Guests')} value={guests} onChangeText={(v) => { setGuests(v.replace(/\D/g, '')); setPage(1); }} keyboardType="number-pad" placeholder="e.g. 50" />
            <Input label={t('events.city', 'City')} value={city} onChangeText={(v) => { setCity(v); setPage(1); }} placeholder="e.g. Hyderabad" />
            {budgetMax || guests || city ? <Button label={t('events.clear', 'Clear all filters')} size="small" variant="dangerGhost" icon={<X size={14} color={danger[600]} />} onPress={clear} /> : null}
          </View>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
          {SORTS.map(([v, l]) => <Chip key={v} label={t(`events.sort.${v}`, l)} selected={sort === v} onPress={() => { setSort(v); setPage(1); }} />)}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <FlatList style={styles.page} data={isLoading ? [] : themes} keyExtractor={(th) => th._id} ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      renderItem={({ item }) => <View style={styles.item}><ThemeCard theme={item} onSave={save} /></View>}
      ListEmptyComponent={isLoading ? <View style={styles.pad}>{[0, 1].map((i) => <Skeleton key={i} height={280} borderRadius={radius.large} />)}</View>
        : <EmptyState icon={<SearchX size={32} color={slate[300]} />} title={t('events.none', 'No themes found')} message={t('events.noneHint', 'Try adjusting your filters or searching for something else.')} actionLabel={t('events.clear', 'Clear all filters')} onAction={clear} />}
      ListFooterComponent={(data?.pages || 0) > 1 ? (
        <View style={styles.pages}>
          {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => <Chip key={p} label={String(p)} selected={p === page} onPress={() => setPage(p)} />)}
        </View>
      ) : null} />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  gap: { gap: spacing.md },
  hero: { gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, overflow: 'hidden', backgroundColor: navy[900] },
  dim: { opacity: 0.45 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 14, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },
  filterOn: { backgroundColor: '#fff' },
  pad: { gap: spacing.md, paddingHorizontal: spacing.base },
  filters: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sorts: { gap: spacing.sm },
  item: { paddingHorizontal: spacing.base, paddingTop: spacing.md },
  pages: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
});
