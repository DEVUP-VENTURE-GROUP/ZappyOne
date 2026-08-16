/**
 * Services — catalog discovery.
 * ----------------------------------------------------------------------------
 * ONE screen serves every vertical; only the data differs. Categories come from
 * `GET /catalog/categories` and services from `GET /catalog/services` — nothing
 * about the catalog is hardcoded here.
 *
 * CATEGORY MATCHING mirrors the server's own rules (`category.model.js`):
 *   1. `matchCategories` when present, else the category `key`
 *   2. legacy `codePrefixes` fallback
 * The previous implementation used plain `service.category === key`, which
 * silently dropped services whose `category` value differs from the group key
 * (the `family` group owns `helper`, `commercial` owns `vehicle`) and every
 * service relying on a code-prefix match.
 *
 * PERFORMANCE: the list is virtualised, rows are memoised, and filtering is
 * memoised on [services, categories, active, query] so typing doesn't re-filter
 * on unrelated renders.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchX } from 'lucide-react-native';
import {
  Chip,
  EmptyState,
  ErrorState,
  Heading,
  SearchBar,
  SectionTitle,
  Skeleton,
  Text,
} from '../../components/ui';
import { CategoryCard, ServiceCard } from '../../components/catalog/ServiceCard';
import {
  categoryForService,
  countByCategory,
  serviceMatchesCategory,
} from '../../components/catalog/matchCategory';
import { useGetCategoriesQuery, useGetServicesQuery } from '../../services/api/catalogApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing, screenPadding, bottomNavClearance } from '../../theme/spacing';
import type { ServiceCatalogItem, ServiceCategory } from '../../types/api';


export default function ServicesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string }>();

  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(params.category ?? null);

  const {
    data: services = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useGetServicesQuery();
  const { data: categories = [] } = useGetCategoriesQuery();

  // The tab stays mounted, so arriving from a Home category tile only changes
  // the route param — the initial useState value never re-runs.
  useEffect(() => {
    if (params.category) setActiveKey(params.category);
  }, [params.category]);

  /** Service counts per category, for the rail's subtitle. */
  const countsByKey = useMemo(
    () => countByCategory(services, categories),
    [services, categories],
  );

  const activeCategory = useMemo(
    () => categories.find((c) => c.key === activeKey) ?? null,
    [categories, activeKey],
  );

  const filtered = useMemo(() => {
    let result = services;

    if (activeCategory) {
      result = result.filter((s) => serviceMatchesCategory(s, activeCategory));
    }

    const term = query.trim().toLowerCase();
    if (term) {
      result = result.filter(
        (s) =>
          (s.name || '').toLowerCase().includes(term) ||
          s.code.toLowerCase().includes(term) ||
          (s.shortDescription || '').toLowerCase().includes(term),
      );
    }

    return result;
  }, [services, activeCategory, query]);

  /** Category that owns a service — supplies the card's accent colour. */
  const categoryFor = useCallback(
    (service: ServiceCatalogItem) => categoryForService(service, categories),
    [categories],
  );

  const openService = useCallback(
    (service: ServiceCatalogItem) => router.push(`/service/${service.code}` as never),
    [router],
  );

  // Tapping a category card opens its dedicated marketplace screen. The
  // in-place `activeKey` filter is still used when arriving with a ?category
  // param, so both entry points keep working.
  const openCategory = useCallback(
    (category: ServiceCategory) => router.push(`/category/${category.key}` as never),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ServiceCatalogItem }) => (
      <ServiceCard service={item} category={categoryFor(item)} onPress={openService} />
    ),
    [categoryFor, openService],
  );

  const clearFilters = useCallback(() => {
    setQuery('');
    setActiveKey(null);
  }, []);

  const hasFilters = Boolean(query) || Boolean(activeKey);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Heading level={1}>Services</Heading>
        <Text variant="muted">Book a verified professional</Text>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search services"
          style={styles.search}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: bottomNavClearance + insets.bottom },
        ]}
        ItemSeparatorComponent={Separator}
        refreshing={isFetching && !isLoading}
        onRefresh={refetch}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Tuned for mid-range Android: a screenful plus a little, reclaim the rest.
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            {/* Category rail — themed cards, matching the website's strip */}
            {categories.length > 0 ? (
              <View style={styles.railBlock}>
                <SectionTitle>Browse by category</SectionTitle>
                <FlatList
                  horizontal
                  data={categories}
                  keyExtractor={(item) => item._id ?? item.key}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                  renderItem={({ item }) => (
                    <CategoryCard
                      category={item}
                      selected={activeKey === item.key}
                      count={countsByKey[item.key]}
                      onPress={openCategory}
                    />
                  )}
                />
              </View>
            ) : null}

            {/* Active filter summary */}
            <View style={styles.resultRow}>
              <SectionTitle style={styles.flex}>
                {activeCategory ? activeCategory.customerLabel : 'All services'}
                {!isLoading ? `  ·  ${filtered.length}` : ''}
              </SectionTitle>
              {hasFilters ? (
                <Chip label="Clear" tone="neutral" onPress={clearFilters} />
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletons}>
              {Array.from({ length: 5 }, (_, i) => (
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
              message={getApiErrorMessage(error, 'We could not load the service catalog.')}
              onRetry={refetch}
            />
          ) : (
            <EmptyState
              icon={<SearchX size={28} color={colors.textMuted} />}
              title="No services found"
              message={
                query
                  ? `Nothing matches “${query}”${
                      activeCategory ? ` in ${activeCategory.customerLabel}` : ''
                    }.`
                  : 'This category has no services yet.'
              }
              actionLabel={hasFilters ? 'Clear filters' : undefined}
              onAction={hasFilters ? clearFilters : undefined}
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

  header: { paddingHorizontal: screenPadding, gap: spacing.xxs },
  search: { marginTop: spacing.md },

  list: { paddingHorizontal: screenPadding, paddingTop: spacing.base, flexGrow: 1 },
  separator: { height: spacing.md },

  railBlock: { marginBottom: spacing.lg },
  rail: { gap: spacing.md, paddingTop: spacing.sm, paddingRight: spacing.lg },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },

  skeletons: { gap: spacing.md },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.base,
  },
  skeletonTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
});
