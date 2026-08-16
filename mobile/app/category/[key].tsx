/**
 * Service category — a category-specific marketplace.
 * ----------------------------------------------------------------------------
 * Each vertical gets its OWN visual identity, driven entirely by the theme the
 * backend already stores on the category (`category.model.js` → theme.accent /
 * deep / tint / soft). The header is an accent→deep gradient — the same pair
 * the website drives its `--cat-accent` / `--cat-deep` custom properties from —
 * so Phone Repair reads violet, Car Services blue, Bike cyan, and so on.
 *
 * WHAT IS AND ISN'T SHOWN
 * The brief asks for a category description "where available". The Category
 * model has NO description/tagline field — verified against the live
 * `GET /catalog/categories` response — so none is shown and none is invented.
 * What the backend genuinely provides and this screen surfaces:
 *   customerLabel · icon · theme · brands[] (only 4 device categories have any)
 * plus the service count, derived from the catalog.
 *
 * Catalog logic is NOT duplicated: category matching and the service card both
 * come from components/catalog, shared with the Services tab.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, SearchX } from 'lucide-react-native';
import {
  Chip,
  EmptyState,
  ErrorState,
  Gradient,
  Heading,
  IconButton,
  SearchBar,
  SectionTitle,
  Skeleton,
  Text,
} from '../../components/ui';
import { ServiceCard } from '../../components/catalog/ServiceCard';
import { resolveCategoryIcon } from '../../components/catalog/categoryIcons';
import { serviceMatchesCategory } from '../../components/catalog/matchCategory';
import { useGetCategoriesQuery, useGetServicesQuery } from '../../services/api/catalogApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing, screenPadding } from '../../theme/spacing';
import type { ServiceCatalogItem } from '../../types/api';

export default function CategoryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const categoryKey = String(key);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');

  const {
    data: services = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useGetServicesQuery();
  const { data: categories = [], isLoading: catsLoading } = useGetCategoriesQuery();

  const category = useMemo(
    () => categories.find((c) => c.key === categoryKey) ?? null,
    [categories, categoryKey],
  );

  /** Services owned by this category, using the server's own matching rules. */
  const categoryServices = useMemo(() => {
    if (!category) return [];
    return services.filter((s) => serviceMatchesCategory(s, category));
  }, [services, category]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return categoryServices;
    return categoryServices.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(term) ||
        s.code.toLowerCase().includes(term) ||
        (s.shortDescription || '').toLowerCase().includes(term),
    );
  }, [categoryServices, query]);

  const openService = useCallback(
    (service: ServiceCatalogItem) => router.push(`/service/${service.code}` as never),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ServiceCatalogItem }) => (
      // The hero is full-bleed, so rows carry their own gutter.
      <View style={styles.row}>
        <ServiceCard service={item} category={category} onPress={openService} />
      </View>
    ),
    [category, openService],
  );

  const accent = category?.theme?.accent ?? zappy[600];
  const deep = category?.theme?.deep ?? zappy[900];
  const Icon = resolveCategoryIcon(category?.icon, categoryKey);
  const brands = category?.brands ?? [];

  // Category not found once the list has loaded — a stale deep link.
  if (!catsLoading && !category) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.plainHeader}>
          <IconButton
            icon={<ChevronLeft size={20} color={colors.textHeading} />}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
        </View>
        <EmptyState
          icon={<SearchX size={28} color={colors.textMuted} />}
          title="Category not found"
          message="This category may have been renamed or removed."
          actionLabel="Browse all services"
          onAction={() => router.replace('/(tabs)/services')}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        ItemSeparatorComponent={Separator}
        refreshing={isFetching && !isLoading}
        onRefresh={refetch}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            {/* ── Themed header — the category's own identity ────────── */}
            <Gradient
              colors={[accent, deep]}
              style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}
            >
              <View style={styles.heroBar}>
                <IconButton
                  icon={<ChevronLeft size={20} color={colors.textInverse} />}
                  onPress={() => router.back()}
                  variant="plain"
                  accessibilityLabel="Go back"
                  style={styles.heroBack}
                />
              </View>

              <View style={styles.heroBody}>
                <View style={styles.heroIcon}>
                  <Icon size={30} strokeWidth={1.8} color={colors.textInverse} />
                </View>

                {catsLoading ? (
                  <Skeleton width={180} height={26} style={{ marginTop: spacing.base }} />
                ) : (
                  <Heading
                    level="display"
                    color={colors.textInverse}
                    style={styles.heroTitle}
                  >
                    {category?.customerLabel}
                  </Heading>
                )}

                <Text variant="body" color="rgba(255,255,255,0.85)">
                  {isLoading
                    ? 'Loading services…'
                    : `${categoryServices.length} service${
                        categoryServices.length === 1 ? '' : 's'
                      } available`}
                </Text>
              </View>
            </Gradient>

            {/* ── Search within the category ─────────────────────────── */}
            <View style={styles.controls}>
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder={`Search in ${category?.customerLabel ?? 'this category'}`}
              />

              {/* Brands — real backend data, only 4 device categories have any */}
              {brands.length > 0 ? (
                <View style={styles.brandBlock}>
                  <SectionTitle>Popular brands</SectionTitle>
                  <View style={styles.brandRow}>
                    {brands.map((brand) => (
                      <Chip
                        key={brand}
                        label={brand}
                        tone="neutral"
                        onPress={() => setQuery(brand)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              <SectionTitle style={styles.listTitle}>
                {query ? `Results  ·  ${filtered.length}` : 'All services'}
              </SectionTitle>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletons}>
              {Array.from({ length: 4 }, (_, i) => (
                <View key={i} style={styles.skeletonCard}>
                  <View style={styles.skeletonTop}>
                    <Skeleton width={56} height={56} borderRadius={radius.medium} />
                    <View style={styles.flex}>
                      <Skeleton width="70%" height={15} />
                      <Skeleton width="90%" height={11} style={{ marginTop: spacing.sm }} />
                    </View>
                  </View>
                  <Skeleton width="45%" height={22} style={{ marginTop: spacing.lg }} />
                </View>
              ))}
            </View>
          ) : error ? (
            <ErrorState
              message={getApiErrorMessage(error, 'We could not load these services.')}
              onRetry={refetch}
            />
          ) : (
            <EmptyState
              icon={<SearchX size={28} color={colors.textMuted} />}
              title={query ? 'No matches' : 'No services yet'}
              message={
                query
                  ? `Nothing matches “${query}” in ${category?.customerLabel}.`
                  : 'This category has no bookable services at the moment.'
              }
              actionLabel={query ? 'Clear search' : 'Browse all services'}
              onAction={
                query ? () => setQuery('') : () => router.replace('/(tabs)/services')
              }
            />
          )
        }
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  plainHeader: { paddingHorizontal: screenPadding, paddingVertical: spacing.sm },

  hero: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.extraLarge,
    borderBottomRightRadius: radius.extraLarge,
  },
  heroBar: { flexDirection: 'row', alignItems: 'center' },
  heroBack: { backgroundColor: 'rgba(255,255,255,0.18)' },
  heroBody: { marginTop: spacing.base },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.medium,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { marginTop: spacing.base, marginBottom: spacing.xxs },

  controls: { paddingHorizontal: screenPadding, marginTop: spacing.lg },
  brandBlock: { marginTop: spacing.lg },
  brandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  listTitle: { marginTop: spacing.lg, marginBottom: spacing.md },

  list: { flexGrow: 1 },
  row: { paddingHorizontal: screenPadding },
  separator: { height: spacing.md },

  skeletons: { gap: spacing.md, paddingHorizontal: screenPadding },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.base,
  },
  skeletonTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
});
