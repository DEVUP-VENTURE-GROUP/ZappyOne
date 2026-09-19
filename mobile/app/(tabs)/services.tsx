/**
 * Services — what a customer can actually book today.
 * ----------------------------------------------------------------------------
 * Rebuilt on the live catalog (`GET /provider/onboarding/catalog`) and the
 * hierarchy the website now uses:
 *
 *     DOMAIN → SERVICE → COVERAGE heading → PROBLEMS
 *
 * ── WHY THE OLD CATALOG MODEL IS GONE ──────────────────────────────────────
 * This screen used to list `/catalog/services` — every service the platform
 * had ever defined, filtered by a client-side category matcher. That list
 * includes services with no verified provider behind them, so a customer could
 * browse in, pick something, and reach a dead end nobody could fulfil. The
 * website retired its catalog page over exactly that.
 *
 * The live catalog returns only lines that are live AND have an approved
 * `ProviderEnrolment` — the same list providers are verified against, so the
 * two sides cannot disagree.
 *
 * ── WHAT WENT AWAY WITH IT ─────────────────────────────────────────────────
 * The search bar and the "from ₹X / fastest N min" stat pills are gone. They
 * were derived from `price` and `estimatedDurationMinutes`, which the old rows
 * carried and live-catalog rows do not. Keeping them would have meant either
 * inventing figures or calling the retired endpoint alongside this one just to
 * decorate a header. The website's own services page shows neither.
 *
 * ── WHY A HERO AND NOT `ScreenHeader` ──────────────────────────────────────
 * This is a root TAB. `ScreenHeader` carries a back button, which would be a
 * lie here — there is nothing to go back to. Pushed routes (category, service
 * detail) use `ScreenHeader`; roots use the catalog hero.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, PackageSearch } from 'lucide-react-native';
import {
  Card,
  EmptyState,
  ErrorState,
  ScalePressable,
  Skeleton,
  Text,
} from '../../components/ui';
import { LiveServiceCard } from '../../components/catalog/LiveServiceCard';
import { iconFor } from '../../components/catalog/liveCatalog';
import { useGetLiveCatalogQuery } from '../../services/api/catalogApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors, indigo } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing, screenPadding, bottomNavClearance } from '../../theme/spacing';
import type { LiveCatalogCategory, LiveCatalogDomain, LiveCatalogService } from '../../types/api';

export default function ServicesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Deep link: `/(tabs)/services?category=electronics` narrows to one domain.
  // An unknown value shows everything rather than an empty screen — a stale
  // link should degrade to the full catalog, not to a dead end.
  const params = useLocalSearchParams<{ category?: string }>();

  const { data: domains, isLoading, isError, error, refetch, isFetching } =
    useGetLiveCatalogQuery();

  const visibleDomains = useMemo(() => {
    const all = domains ?? [];
    if (!params.category) return all;
    const needle = params.category.toLowerCase();
    const scoped = all.filter((d) => d.code.toLowerCase() === needle);
    return scoped.length ? scoped : all;
  }, [domains, params.category]);

  const openService = useCallback(
    (service: LiveCatalogService) => router.push(`/service/${service.code}` as never),
    [router],
  );

  // The heading code alone is ambiguous — "display" exists for phones AND
  // laptops — so the service that owns it travels with the link.
  const openCategory = useCallback(
    (category: LiveCatalogCategory, service: LiveCatalogService) =>
      router.push(`/category/${category.code}?service=${service.code}` as never),
    [router],
  );

  const renderDomain = useCallback(
    ({ item }: { item: LiveCatalogDomain }) => {
      const Icon = iconFor(item.icon);
      return (
        <View style={styles.domain}>
          <View style={styles.domainHead}>
            <View style={styles.domainIcon}>
              <Icon size={17} strokeWidth={2} color={indigo[500]} />
            </View>
            <View style={styles.domainText}>
              <Text variant="heading3" weight="black" numberOfLines={2}>
                {item.name}
              </Text>
              {item.description ? (
                <Text variant="bodySmall" numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.services}>
            {item.services.map((service) => (
              <LiveServiceCard
                key={service.code}
                service={service}
                onPress={openService}
                onPressCategory={openCategory}
              />
            ))}
          </View>
        </View>
      );
    },
    [openCategory, openService],
  );

  const header = (
    <View style={styles.hero}>
      <Text variant="eyebrow">Zappy catalog</Text>
      <Text variant="pageTitle">All Services</Text>
      <Text variant="muted" style={styles.subtitle}>
        What we can do for you today
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        {header}
        <View style={styles.padded}>
          <ServiceSkeletons />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        {header}
        <ErrorState
          message={getApiErrorMessage(error)}
          onRetry={refetch}
          style={styles.padded}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <FlatList
        data={visibleDomains}
        keyExtractor={(d) => d.code}
        renderItem={renderDomain}
        ListHeaderComponent={header}
        ListEmptyComponent={<CatalogEmptyState />}
        ListFooterComponent={
          visibleDomains.length ? (
            <MoreComing onBrowseShops={() => router.push('/shops' as never)} />
          ) : null
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshing={isFetching && !isLoading}
        onRefresh={refetch}
      />
    </View>
  );
}

/**
 * Shape-matched loading, not a spinner: an icon chip, two text lines and the
 * coverage strip, at the sizes the real card uses, so nothing jumps when the
 * data lands.
 */
function ServiceSkeletons() {
  return (
    <View accessibilityLabel="Loading services" accessibilityRole="progressbar">
      {[0, 1].map((i) => (
        <View key={i} style={[styles.skelCard, i > 0 && { marginTop: spacing.md }]}>
          <View style={styles.skelRow}>
            <Skeleton width={48} height={48} borderRadius={radius.medium} />
            <View style={styles.skelBody}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="85%" height={11} style={{ marginTop: spacing.sm }} />
            </View>
          </View>
          <View style={styles.skelRail}>
            {[0, 1, 2].map((t) => (
              <Skeleton key={t} width={116} height={145} borderRadius={radius.medium} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * The honest empty state.
 *
 * `{ domains: [] }` is a VALID response: a service line only appears once some
 * provider holds an approved enrolment for it. So this means "nothing is
 * bookable yet", not "something broke" — and it must never be papered over
 * with placeholder services, which is the dead-end problem the live catalog
 * exists to prevent.
 */
function CatalogEmptyState() {
  return (
    <EmptyState
      icon={<PackageSearch size={28} color={colors.primary} />}
      title="No services available yet"
      message="Services appear here as soon as we have verified providers for them. Nothing is bookable in your area right now."
      style={styles.padded}
    />
  );
}

/** The website's dashed "more on the way" card — a sentence, never a dead tile. */
function MoreComing({ onBrowseShops }: { onBrowseShops: () => void }) {
  return (
    <Card variant="outline" style={styles.more} padding={spacing.base}>
      <Text variant="bodySmall" weight="bold" color={colors.textPrimary} align="center">
        More services are on the way
      </Text>
      <Text variant="caption" align="center" style={styles.moreSub}>
        New services open as soon as we have verified providers for them.
      </Text>
      <ScalePressable
        onPress={onBrowseShops}
        accessibilityRole="button"
        accessibilityLabel="Browse nearby shops"
        hitSlop={8}
      >
        <View style={styles.moreCta}>
          <Text variant="caption" weight="bold" color={colors.primary}>
            Browse nearby shops meanwhile
          </Text>
          <ArrowRight size={13} color={colors.primary} />
        </View>
      </ScalePressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: bottomNavClearance },
  padded: { paddingHorizontal: screenPadding },
  hero: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.lg,
  },
  subtitle: { marginTop: spacing.xs },

  domain: { marginTop: spacing.xl },
  domainHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: screenPadding,
  },
  domainIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.button,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  domainText: { flex: 1, minWidth: 0 },
  services: {
    marginTop: spacing.md,
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },

  skelCard: {
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  skelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    padding: spacing.base,
  },
  skelBody: { flex: 1 },
  skelRail: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.base,
    paddingBottom: 14,
  },

  more: {
    marginTop: spacing.xl,
    marginHorizontal: screenPadding,
    borderStyle: 'dashed',
  },
  moreSub: { marginTop: 2 },
  moreCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
