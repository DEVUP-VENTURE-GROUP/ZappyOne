/**
 * Service category — the mobile translation of the website's catalog page.
 * ----------------------------------------------------------------------------
 * `client/src/pages/CategoryCatalogPage.jsx` is a thin wrapper over
 * `components/catalog/ServiceCatalogView`, and this screen mirrors that view's
 * anatomy in the same order:
 *
 *   CatalogHeader   eyebrow · title · subtitle · stat pills · search
 *   FacetRail       filter chips with live counts
 *   grid header     "N SERVICES AVAILABLE" + Clear filters
 *   mosaic grid     lead tiles double-width, the rest quarter-width
 *   CategoryStrip   "Other Zappy services" cross-sell
 *
 * ── WHY THE HERO IS NO LONGER A GRADIENT ───────────────────────────────────
 * This screen used to open with a saturated accent→deep gradient and white
 * text. The website does the opposite: a light page with the category's accent
 * used sparingly — the eyebrow, the stat dots, the selected facet, the retry
 * button. The gradient made every category page look like the same coloured
 * banner rather than the catalog it is, so the identity now comes from the
 * accent, as it does on the web.
 *
 * ── WHERE THE DATA COMES FROM ──────────────────────────────────────────────
 * Services and categories are the live catalog, unchanged. Facets are computed
 * over those services by `components/catalog/facets`, so every chip count is
 * real and empty facets never render. The eyebrow, subtitle and facet
 * definitions come from `constants/categoryPageConfig` — the same product copy
 * the website keeps in its own constants, since `GET /catalog/categories`
 * carries none of it. Nothing here invents a service, a price or a count.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronLeft, ChevronRight, SearchX } from 'lucide-react-native';
import {
  Button,
  Card,
  IconButton,
  ScalePressable,
  SearchBar,
  Skeleton,
  Text,
} from '../../components/ui';
import { ServiceTile } from '../../components/catalog/ServiceTile';
import { ServiceIllustration } from '../../components/catalog/ServiceIllustration';
import { StatPill } from '../../components/catalog/StatPill';
import { CATEGORY_THEME, DEFAULT_THEME } from '../../components/catalog/illustrations/palette';
import { serviceMatchesCategory } from '../../components/catalog/matchCategory';
import {
  applyFacet,
  buildFacets,
  categoryStats,
  searchServices,
} from '../../components/catalog/facets';
import {
  DEFAULT_FACETS,
  categoryPageConfig,
} from '../../constants/categoryPageConfig';
import { useGetCategoriesQuery, useGetServicesQuery } from '../../services/api/catalogApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors, danger, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing, screenPadding } from '../../theme/spacing';
import { fontFamily } from '../../theme/typography';
import type { ServiceCatalogItem, ServiceCategory } from '../../types/api';

/** The website leads with four double-width tiles before the mosaic breaks. */
const LEAD_TILES = 4;
/** Gap between mosaic tiles — `gap-2.5` on the web. */
const GRID_GAP = 10;

export default function CategoryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const categoryKey = String(key);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState('');
  const [facetKey, setFacetKey] = useState('all');

  const {
    data: services = [],
    isLoading,
    error,
    refetch,
  } = useGetServicesQuery();
  const { data: categories = [], isLoading: catsLoading } = useGetCategoriesQuery();

  const category = useMemo(
    () => categories.find((c) => c.key === categoryKey) ?? null,
    [categories, categoryKey],
  );

  const config = categoryPageConfig(categoryKey);

  /** Services owned by this category, using the server's own matching rules. */
  const pool = useMemo(() => {
    if (!category) return [];
    return services.filter((s) => serviceMatchesCategory(s, category));
  }, [services, category]);

  const facets = useMemo(
    () => buildFacets(config?.facets ?? DEFAULT_FACETS, pool),
    [config, pool],
  );

  // A facet carried over from another category may not exist here.
  const activeFacet = facets.some((f) => f.key === facetKey) ? facetKey : 'all';

  /**
   * Never dead-end on a typo: when a search matches nothing, fall back to the
   * unsearched list and say so — the website's own behaviour.
   */
  const { list, noExactMatch } = useMemo(() => {
    const next = applyFacet(pool, facets, activeFacet);
    const q = query.trim();
    if (!q) return { list: next, noExactMatch: false };
    const hits = searchServices(next, q);
    if (hits.length) return { list: hits, noExactMatch: false };
    return { list: next, noExactMatch: true };
  }, [pool, facets, activeFacet, query]);

  const stats = useMemo(() => categoryStats(pool), [pool]);

  const openService = useCallback(
    (service: ServiceCatalogItem) => router.push(`/service/${service.code}` as never),
    [router],
  );

  const clearFilters = useCallback(() => {
    setQuery('');
    setFacetKey('all');
  }, []);

  const accent = category?.theme?.accent ?? zappy[600];
  const drawing = CATEGORY_THEME[categoryKey]?.illustration ?? DEFAULT_THEME.illustration;
  const title = config?.title ?? category?.customerLabel ?? '';

  /** Mosaic geometry — a 4-column grid; lead tiles span two of them. */
  const colWidth = (width - screenPadding * 2 - GRID_GAP * 3) / 4;
  const largeWidth = colWidth * 2 + GRID_GAP;

  const hasFilters = Boolean(query) || activeFacet !== 'all';
  const isEmpty = !isLoading && !error && list.length === 0;

  /** Other verticals, for the cross-sell strip at the foot of the page. */
  const otherCategories = useMemo(
    () => categories.filter((c) => c.key !== categoryKey && c.isActive !== false).slice(0, 8),
    [categories, categoryKey],
  );

  const serviceCountFor = useCallback(
    (c: ServiceCategory) => services.filter((s) => serviceMatchesCategory(s, c)).length,
    [services],
  );

  // ── Category not found once the list has loaded — a stale deep link ───────
  if (!catsLoading && !category) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <IconButton
            icon={<ChevronLeft size={20} color={colors.textHeading} />}
            onPress={() => router.back()}
            variant="surface"
            accessibilityLabel="Go back"
          />
        </View>
        <View style={styles.stateCard}>
          <View style={[styles.stateIcon, { backgroundColor: slate[100] }]}>
            <SearchX size={26} color={colors.textMuted} />
          </View>
          <Text style={styles.stateTitle}>Category not found</Text>
          <Text variant="muted" style={styles.stateBody}>
            This category may have been renamed or removed.
          </Text>
          <Button
            label="Browse all services"
            onPress={() => router.replace('/(tabs)/services')}
            style={styles.stateAction}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          // This route pushes over the tabs, so there is no bottom nav to clear —
          // only the safe-area inset plus a normal end-of-page gutter.
          { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <IconButton
            icon={<ChevronLeft size={20} color={colors.textHeading} />}
            onPress={() => router.back()}
            variant="surface"
            accessibilityLabel="Go back"
          />
        </View>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroText}>
            {config ? (
              <Text variant="eyebrow" color={accent}>
                {config.eyebrow}
              </Text>
            ) : null}

            {catsLoading && !title ? (
              <Skeleton width={190} height={30} style={{ marginTop: spacing.xs }} />
            ) : (
              <Text variant="pageTitle" style={styles.heroTitle}>
                {title}
              </Text>
            )}

            {config?.subtitle ? (
              <Text variant="muted" weight="medium" style={styles.heroSubtitle}>
                {config.subtitle}
              </Text>
            ) : null}
          </View>

          {/* The website floats the category's illustration beside the title. */}
          <ServiceIllustration name={drawing} size={64} categoryKey={categoryKey} />
        </View>

        {/* Measured from the services actually in this category — no claims. */}
        {stats ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statRow}
          >
            <StatPill tint={accent} label={`${stats.count} services`} />
            {stats.fromRupees != null ? (
              <StatPill tint={accent} label={`From ₹${stats.fromRupees}`} />
            ) : null}
            {stats.fastestMin != null ? (
              <StatPill tint={accent} label={`Fastest ${stats.fastestMin} min`} />
            ) : null}
            {stats.withChecklist > 0 ? (
              <StatPill tint={accent} label={`${stats.withChecklist} with job checklists`} />
            ) : null}
          </ScrollView>
        ) : null}

        {/* ── Search ───────────────────────────────────────────────────── */}
        <View style={styles.gutter}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="What service are you looking for?"
          />
        </View>

        {/* ── Facet rail ───────────────────────────────────────────────── */}
        {facets.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.facetRow}
            keyboardShouldPersistTaps="handled"
          >
            {facets.map((facet) => {
              const selected = facet.key === activeFacet;
              return (
                <ScalePressable
                  key={facet.key}
                  onPress={() => setFacetKey(facet.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${facet.label}, ${facet.count} services`}
                  style={[
                    styles.facet,
                    selected ? { backgroundColor: accent, borderColor: accent } : null,
                  ]}
                >
                  <Text
                    variant="chip"
                    weight="bold"
                    color={selected ? colors.textInverse : colors.textHeading}
                  >
                    {facet.label}
                  </Text>
                  <Text
                    variant="chip"
                    weight="bold"
                    color={selected ? 'rgba(255,255,255,0.75)' : colors.textMuted}
                  >
                    {facet.count}
                  </Text>
                </ScalePressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error ? (
          <View style={styles.gutter}>
            <View style={styles.stateCard}>
              <View style={[styles.stateIcon, { backgroundColor: danger[50] }]}>
                <AlertTriangle size={28} color={danger[400]} />
              </View>
              <Text style={styles.stateTitle}>Couldn&apos;t load services</Text>
              <Text variant="muted" style={styles.stateBody}>
                {getApiErrorMessage(error, 'Check your connection and try again.')}
              </Text>
              <Button
                label="Retry"
                onPress={refetch}
                style={[styles.stateAction, { backgroundColor: accent }]}
              />
            </View>
          </View>
        ) : null}

        {/* ── Typo fallback note ───────────────────────────────────────── */}
        {noExactMatch && !isEmpty ? (
          <View style={styles.gutter}>
            <View style={[styles.note, { borderColor: accent, backgroundColor: colors.surfaceSecondary }]}>
              <SearchX size={17} color={accent} />
              <Text variant="bodySmall" weight="semibold" color={colors.textHeading} style={styles.flex}>
                No exact match for “{query.trim()}” — here&apos;s everything else in {title}.
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Grid header ──────────────────────────────────────────────── */}
        {!error && !isLoading && list.length > 0 ? (
          <View style={[styles.gutter, styles.gridHead]}>
            <Text style={styles.gridCount}>
              {list.length} {list.length === 1 ? 'service' : 'services'} available
            </Text>
            {hasFilters ? (
              <ScalePressable onPress={clearFilters} accessibilityRole="button" hitSlop={8}>
                <Text variant="chip" weight="bold" color={accent}>
                  Clear filters
                </Text>
              </ScalePressable>
            ) : null}
          </View>
        ) : null}

        {/* ── Loading ──────────────────────────────────────────────────── */}
        {isLoading ? (
          <View style={[styles.gutter, styles.grid]}>
            {Array.from({ length: 2 }, (_, i) => (
              <Skeleton key={`l${i}`} width={largeWidth} height={188} borderRadius={20} />
            ))}
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={`s${i}`} width={colWidth} height={136} borderRadius={20} />
            ))}
          </View>
        ) : null}

        {/* ── Empty ────────────────────────────────────────────────────── */}
        {isEmpty ? (
          <View style={styles.gutter}>
            <View style={styles.stateCard}>
              <View style={[styles.stateIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <SearchX size={26} color={accent} />
              </View>
              <Text style={styles.stateTitle}>No services match that</Text>
              <Text variant="muted" style={styles.stateBody}>
                Try a different filter, or clear everything to see the full list.
              </Text>
              <Button
                label="Show all services"
                onPress={clearFilters}
                style={[styles.stateAction, styles.navyAction]}
              />
            </View>
          </View>
        ) : null}

        {/* ── Mosaic grid ──────────────────────────────────────────────── */}
        {list.length > 0 ? (
          <View style={[styles.gutter, styles.grid]}>
            {list.map((service, i) => {
              const large = i < LEAD_TILES;
              return (
                <ServiceTile
                  key={service.code}
                  service={service}
                  variant={large ? 'large' : 'small'}
                  accent={accent}
                  onPress={openService}
                  style={{ width: large ? largeWidth : colWidth }}
                />
              );
            })}
          </View>
        ) : null}

        {/* ── Cross-sell ───────────────────────────────────────────────── */}
        {otherCategories.length > 0 && !isLoading && !error ? (
          <View style={styles.crossSell}>
            <Text style={[styles.gridCount, styles.gutter]}>Other Zappy services</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.crossRow}
            >
              {otherCategories.map((c) => (
                <ScalePressable
                  key={c.key}
                  onPress={() => router.replace(`/category/${c.key}` as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.customerLabel}, ${serviceCountFor(c)} services`}
                >
                  <Card variant="outline" padding={spacing.md} style={styles.crossCard}>
                    <ServiceIllustration
                      name={CATEGORY_THEME[c.key]?.illustration ?? DEFAULT_THEME.illustration}
                      size={34}
                      categoryKey={c.key}
                      spotlight={false}
                    />
                    <Text
                      variant="bodySmall"
                      weight="bold"
                      color={colors.textHeading}
                      numberOfLines={2}
                    >
                      {c.customerLabel}
                    </Text>
                    <View style={styles.crossMeta}>
                      <Text variant="caption" color={colors.textMuted}>
                        {serviceCountFor(c)} services
                      </Text>
                      <ChevronRight size={13} color={c.theme?.accent ?? colors.primary} />
                    </View>
                  </Card>
                </ScalePressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { gap: spacing.base },
  flex: { flex: 1 },
  gutter: { paddingHorizontal: screenPadding },

  topBar: { paddingHorizontal: screenPadding, flexDirection: 'row' },

  hero: {
    paddingHorizontal: screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  heroText: { flex: 1 },
  heroTitle: { marginTop: spacing.xs },
  heroSubtitle: { marginTop: spacing.xs },

  statRow: { paddingHorizontal: screenPadding, gap: spacing.sm },

  // `rounded-full border px-3 py-1.5` — the website's facet chip.
  facetRow: { paddingHorizontal: screenPadding, gap: spacing.sm },
  facet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    // 44pt-tall touch target once the label's line height is added.
    paddingVertical: spacing.sm + 2,
  },

  gridHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // `text-[11px] font-black uppercase tracking-[0.16em] text-slate-400`
  gridCount: {
    fontFamily: fontFamily.black,
    fontSize: 11,
    lineHeight: 17,
    letterSpacing: 1.76,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },

  // The website's empty/error card: `rounded-[24px] border bg-white py-14`.
  stateCard: {
    alignItems: 'center',
    gap: spacing.base,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.huge,
    marginHorizontal: screenPadding,
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    fontFamily: fontFamily.black,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textHeading,
    textAlign: 'center',
  },
  stateBody: { textAlign: 'center' },
  stateAction: { marginTop: spacing.xs },
  navyAction: { backgroundColor: colors.textHeading },

  crossSell: { gap: spacing.md, marginTop: spacing.lg },
  crossRow: { paddingHorizontal: screenPadding, gap: spacing.md },
  crossCard: { width: 132, gap: spacing.sm },
  crossMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
