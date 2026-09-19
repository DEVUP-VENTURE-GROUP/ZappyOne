/**
 * Service detail — one bookable service and everything it covers.
 * ----------------------------------------------------------------------------
 * The second level of the live catalog:
 *
 *     DOMAIN → **SERVICE** → COVERAGE heading → PROBLEMS
 *
 * ── WHY THE SYMPTOM LIST IS NOT FLATTENED HERE ─────────────────────────────
 * A service covers a hundred-odd symptoms. Listing them all on this screen
 * would bury the choice that actually matters first — which KIND of problem
 * you have — which is precisely why the website groups them under headings
 * and makes opening a heading a page of its own. So this screen shows the
 * headings and the popular shortlist; the symptoms live one tap deeper.
 *
 * ── WHAT THIS SCREEN DELIBERATELY DOES NOT SHOW ────────────────────────────
 * No price, no duration, no provider count, no "book now". The live-catalog
 * response carries none of those, and a service being listed says only that
 * somebody is verified to do it — not what it costs here, today, for this
 * customer. Anything of that sort on this screen would be invented, so the
 * screen stops at describing the work.
 *
 * `requiresDiagnosis` IS shown, because the API supplies it per problem and it
 * sets an honest expectation rather than a promise.
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
import { findService, iconFor, problemCount } from '../../components/catalog/liveCatalog';
import { useGetLiveCatalogQuery } from '../../services/api/catalogApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors, indigo } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing, screenPadding } from '../../theme/spacing';

export default function ServiceDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code: string }>();

  const { data: domains, isLoading, isError, error, refetch } = useGetLiveCatalogQuery();

  const found = useMemo(() => findService(domains ?? [], code), [domains, code]);

  /**
   * Which of the popular shortlist need a diagnosis.
   *
   * `highlights` carries only `{ code, name }`, but the same problems appear
   * in full under `coverage` — so this reads the real flag off the real row
   * rather than guessing from the name.
   */
  const diagnosisCodes = useMemo(() => {
    const set = new Set<string>();
    found?.service.coverage.forEach((c) =>
      c.problems.forEach((p) => {
        if (p.requiresDiagnosis) set.add(p.code);
      }),
    );
    return set;
  }, [found]);

  const back = useCallback(() => router.back(), [router]);

  const openCategory = useCallback(
    (categoryCode: string) => {
      if (!found) return;
      router.push(`/category/${categoryCode}?service=${found.service.code}` as never);
    },
    [router, found],
  );

  /* ── Loading ── */
  if (isLoading) {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Loading…" onBack={back} />
        </View>
        <View style={styles.padded}>
          <Skeleton width={56} height={56} borderRadius={radius.medium} style={{ marginTop: spacing.lg }} />
          <Skeleton width="65%" height={26} style={{ marginTop: spacing.md }} />
          <Skeleton width="90%" height={13} style={{ marginTop: spacing.sm }} />
          <View style={styles.skelRail}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width={CATEGORY_TILE_WIDTH} height={145} borderRadius={radius.medium} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  /* ── Request failed ── */
  if (isError) {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Service" onBack={back} />
        </View>
        <ErrorState message={getApiErrorMessage(error)} onRetry={refetch} style={styles.padded} />
      </View>
    );
  }

  /* ── Not in the live catalog ── */
  if (!found) {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Not available" onBack={back} />
        </View>
        <EmptyState
          icon={<SearchX size={28} color={colors.primary} />}
          title="This service isn’t available"
          message="It may have been retired, or there are no verified providers offering it right now."
          actionLabel="See all services"
          onAction={() => router.replace('/(tabs)/services' as never)}
          style={styles.padded}
        />
      </View>
    );
  }

  const { service, domain } = found;
  const Icon = iconFor(service.icon);
  const total = problemCount(service);

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={service.name} subtitle={domain.name} onBack={back} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.iconChip}>
            <Icon size={26} strokeWidth={1.75} color={indigo[600]} />
          </View>

          <View style={styles.titleRow}>
            <Text variant="pageTitle" style={styles.title}>
              {service.name}
            </Text>
            {service.isPopular ? <Chip label="Popular" tone="blue" /> : null}
          </View>

          {service.tagline ? (
            <Text variant="muted" style={styles.tagline}>
              {service.tagline}
            </Text>
          ) : null}
          {service.description && service.description !== service.tagline ? (
            <Text variant="body" style={styles.description}>
              {service.description}
            </Text>
          ) : null}

          {total > 0 ? (
            <Text variant="bodySmall" style={styles.coverageCount}>
              {total} {total === 1 ? 'issue' : 'issues'} covered across{' '}
              {service.coverage.length}{' '}
              {service.coverage.length === 1 ? 'category' : 'categories'}
            </Text>
          ) : null}
        </View>

        {/* ── Popular shortlist ── */}
        {service.highlights.length > 0 ? (
          <View style={styles.block}>
            <Text variant="sectionHeading" style={styles.blockTitle}>
              Common issues
            </Text>
            <View style={styles.highlights}>
              {service.highlights.map((h) => (
                <Chip
                  key={h.code}
                  label={h.name}
                  tone="neutral"
                  icon={
                    diagnosisCodes.has(h.code) ? (
                      <Stethoscope size={12} color={colors.textSecondary} />
                    ) : undefined
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Coverage headings ── */}
        {service.coverage.length > 0 ? (
          <View style={styles.block}>
            <Text variant="sectionHeading" style={styles.blockTitle}>
              What we cover
            </Text>
            <HScrollRail
              itemWidth={CATEGORY_TILE_WIDTH}
              gap={10}
              contentPadding={screenPadding}
              fadeColor={colors.background}
            >
              {service.coverage.map((c) => (
                <CategoryTile
                  key={c.code}
                  name={c.name}
                  code={c.code}
                  count={c.problems.length}
                  imageUrl={c.imageUrl}
                  onPress={() => openCategory(c.code)}
                />
              ))}
            </HScrollRail>
          </View>
        ) : (
          <Card variant="outline" style={styles.noCoverage} padding={spacing.base}>
            <Text variant="bodySmall" align="center">
              Coverage details for this service are still being added.
            </Text>
          </Card>
        )}

        {/* An honest note rather than a price or a "Book now" the response
            cannot back up. */}
        <Card variant="flat" style={styles.note} padding={spacing.base}>
          <Text variant="caption">
            Pick the category that matches your problem to see the symptoms we handle.
            Some faults need a diagnosis before they can be priced.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.lg },
  padded: { paddingHorizontal: screenPadding },

  hero: { paddingHorizontal: screenPadding },
  iconChip: {
    width: 56,
    height: 56,
    borderRadius: radius.medium,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  title: { flexShrink: 1 },
  tagline: { marginTop: spacing.xs },
  description: { marginTop: spacing.sm },
  coverageCount: { marginTop: spacing.md },

  block: { marginTop: spacing.xl },
  blockTitle: { paddingHorizontal: screenPadding },
  highlights: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: screenPadding,
  },

  noCoverage: { marginTop: spacing.xl, marginHorizontal: screenPadding },
  note: { marginTop: spacing.xl, marginHorizontal: screenPadding },

  skelRail: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.xl,
  },
});
