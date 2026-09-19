/**
 * Category — one coverage heading, and the symptoms filed under it.
 * ----------------------------------------------------------------------------
 * The third level of the live catalog:
 *
 *     DOMAIN → SERVICE → **COVERAGE heading** → PROBLEMS
 *
 * Reached from the coverage rail on a service card, mirroring the website's
 * `/repair/category/:vertical/:categoryCode`.
 *
 * ── THE `service` QUERY PARAM IS NOT OPTIONAL DECORATION ───────────────────
 * Heading codes are unique per VERTICAL, not globally — "display" is a
 * legitimate heading for both phones and laptops, which is exactly why the
 * server indexes them `{vertical, code}`. Resolving `key` alone would let a
 * laptop link land on the phone's heading. So the owning service travels with
 * the link and scopes the lookup; `findCategory` falls back to an unscoped
 * search only when no service is supplied, for older links.
 *
 * ── WHEN THE HEADING NO LONGER EXISTS ──────────────────────────────────────
 * Renders a deliberate not-found state. It does NOT fall back to the retired
 * `/catalog/services` model or to placeholder content: a heading can vanish
 * legitimately (its last provider's enrolment lapsed), and saying so is the
 * honest answer.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchX, Stethoscope } from 'lucide-react-native';
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  HScrollRail,
  ScreenHeader,
  Skeleton,
  Text,
} from '../../components/ui';
import { CategoryTile, CATEGORY_TILE_WIDTH } from '../../components/catalog/CategoryTile';
import { LiveServiceCard } from '../../components/catalog/LiveServiceCard';
import { findCategory } from '../../components/catalog/liveCatalog';
import { useGetLiveCatalogQuery } from '../../services/api/catalogApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing, screenPadding } from '../../theme/spacing';
import type { LiveCatalogProblem } from '../../types/api';

export default function CategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { key, service: serviceCode } = useLocalSearchParams<{
    key: string;
    service?: string;
  }>();

  const { data: domains, isLoading, isError, error, refetch } = useGetLiveCatalogQuery();

  const found = useMemo(
    () => findCategory(domains ?? [], key, serviceCode),
    [domains, key, serviceCode],
  );

  const openSibling = useCallback(
    (code: string) => {
      if (!found) return;
      // `replace`, not `push`: switching headings inside one service is a
      // lateral move, so back should return to the service, not walk through
      // every heading the customer sampled.
      router.replace(`/category/${code}?service=${found.service.code}` as never);
    },
    [router, found],
  );

  const openService = useCallback(() => {
    if (!found) return;
    router.push(`/service/${found.service.code}` as never);
  }, [router, found]);

  const back = useCallback(() => router.back(), [router]);

  /* ── Loading ── */
  if (isLoading) {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Loading…" onBack={back} />
        </View>
        <View style={styles.padded}>
          <Skeleton width="55%" height={22} style={{ marginTop: spacing.lg }} />
          <Skeleton width="80%" height={13} style={{ marginTop: spacing.sm }} />
          <View style={styles.skelRail}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width={CATEGORY_TILE_WIDTH} height={145} borderRadius={radius.medium} />
            ))}
          </View>
          <Skeleton width="100%" height={180} borderRadius={radius.large} />
        </View>
      </View>
    );
  }

  /* ── Request failed ── */
  if (isError) {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Category" onBack={back} />
        </View>
        <ErrorState message={getApiErrorMessage(error)} onRetry={refetch} style={styles.padded} />
      </View>
    );
  }

  /* ── Resolved fine, but this heading is not in the live catalog ── */
  if (!found) {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Not available" onBack={back} />
        </View>
        <EmptyState
          icon={<SearchX size={28} color={colors.primary} />}
          title="This category isn’t available"
          message="It may have been retired, or there are no verified providers covering it right now."
          actionLabel="See all services"
          onAction={() => router.replace('/(tabs)/services' as never)}
          style={styles.padded}
        />
      </View>
    );
  }

  const { category, service } = found;
  const siblings = service.coverage.filter((c) => c.code !== category.code);

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={category.name} subtitle={service.name} onBack={back} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        <View style={styles.intro}>
          <Text variant="eyebrow">{service.name}</Text>
          <Text variant="pageTitle">{category.name}</Text>
          <Text variant="muted" style={styles.introSub}>
            {category.problems.length}{' '}
            {category.problems.length === 1 ? 'issue' : 'issues'} we cover here
          </Text>
        </View>

        {/* ── The symptoms. This is the leaf of the hierarchy. ──────────────
            Display only. Tapping one would start a booking, and booking
            eligibility is not something this response describes — it carries
            no price, no provider and no availability. Wiring that from here
            would be inventing behaviour the API never promised. */}
        <Card style={styles.problems} padding={0}>
          {category.problems.map((problem, i) => (
            <ProblemRow key={problem.code} problem={problem} first={i === 0} />
          ))}
        </Card>

        {siblings.length > 0 ? (
          <View style={styles.siblings}>
            <Text variant="sectionHeading" style={styles.siblingsTitle}>
              Other {service.name} issues
            </Text>
            <HScrollRail
              itemWidth={CATEGORY_TILE_WIDTH}
              gap={10}
              contentPadding={screenPadding}
              fadeColor={colors.background}
            >
              {siblings.map((c) => (
                <CategoryTile
                  key={c.code}
                  name={c.name}
                  code={c.code}
                  count={c.problems.length}
                  imageUrl={c.imageUrl}
                  onPress={() => openSibling(c.code)}
                />
              ))}
            </HScrollRail>
          </View>
        ) : null}

        <View style={styles.serviceBlock}>
          <Text variant="sectionHeading" style={styles.siblingsTitle}>
            About this service
          </Text>
          <View style={styles.serviceCard}>
            {/* Coverage hidden — the rail above already shows it. */}
            <LiveServiceCard service={service} onPress={openService} showCoverage={false} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * One symptom. `requiresDiagnosis` is shown because the API supplies it and it
 * sets an honest expectation — some faults genuinely cannot be priced before
 * somebody looks. Severity is surfaced only at `high`/`critical`; tagging every
 * row "normal" would be noise.
 */
function ProblemRow({ problem, first }: { problem: LiveCatalogProblem; first: boolean }) {
  const severe = problem.severity === 'high' || problem.severity === 'critical';

  return (
    <View style={[styles.problemRow, !first && styles.problemDivider]}>
      <View style={styles.problemText}>
        <Text variant="body" weight="semibold" color={colors.textHeading} numberOfLines={2}>
          {problem.name}
        </Text>
        {problem.requiresDiagnosis ? (
          <View style={styles.problemMeta}>
            <Stethoscope size={12} color={colors.textMuted} />
            <Text variant="caption">Needs a diagnosis before pricing</Text>
          </View>
        ) : null}
      </View>
      {severe ? (
        <Chip
          label={problem.severity === 'critical' ? 'Critical' : 'Urgent'}
          tone={problem.severity === 'critical' ? 'red' : 'accent'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.lg },
  padded: { paddingHorizontal: screenPadding },

  intro: { paddingHorizontal: screenPadding },
  introSub: { marginTop: spacing.xs },

  problems: {
    marginTop: spacing.lg,
    marginHorizontal: screenPadding,
  },
  problemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  problemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  problemText: { flex: 1, minWidth: 0 },
  problemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },

  siblings: { marginTop: spacing.xl },
  siblingsTitle: { paddingHorizontal: screenPadding },
  serviceBlock: { marginTop: spacing.xl },
  serviceCard: { paddingHorizontal: screenPadding },

  skelRail: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: spacing.lg,
  },
});
