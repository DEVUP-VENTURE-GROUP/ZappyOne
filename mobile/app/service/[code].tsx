/**
 * Service details.
 * ----------------------------------------------------------------------------
 * Answers the four questions the brief asks, in order: what is this, what does
 * it cost, what's included, how do I book it.
 *
 * EVERY VALUE COMES FROM THE CATALOG. Nothing is computed or invented here:
 *
 *   name / description        → shown when set
 *   price                     → servicePricePaise when > 0 (fixed), otherwise
 *                               the priceRangeMin..Max band. Many services are
 *                               a RANGE, not a single figure — car_wash is
 *                               ₹300–₹700 — so a range renders as a range
 *                               rather than quietly showing the minimum.
 *   inspectionFeePaise        → surfaced only when set; it is a real charge and
 *                               hiding it would misrepresent the cost
 *   estimatedDurationMinutes  → duration
 *   checklist[]               → "What's included"
 *   requiredTools[]           → "What your pro brings"
 *   coverImage / imageUrl     → hero art, else the resolved category icon
 *
 * DELIBERATELY NOT SHOWN: `service.guidelines`. It reads like customer copy but
 * the live values are internal instructions to the technician — e.g.
 * screen_replacement carries "Never quote OEM price — deliver OEM quality" and
 * software_issue carries "Never access personal apps without explicit request".
 * These are operating policy for the pro, not information for the buyer, and
 * publishing them verbatim would leak pricing policy into the storefront. The
 * field belongs on the worker's job screen instead.
 *
 * The authoritative price is still the server QUOTE at booking time; this
 * screen only shows the catalog's advertised band, and says so.
 *
 * The hero takes the CATEGORY's theme gradient, so a service inherits the
 * identity of the vertical it belongs to.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useMemo } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  ChevronLeft,
  Clock,
  Info,
  PackageCheck,
  SearchX,
  ShieldCheck,
} from 'lucide-react-native';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Gradient,
  Heading,
  IconButton,
  SectionTitle,
  Skeleton,
  Text,
  formatRupees,
} from '../../components/ui';
import { ServiceCard } from '../../components/catalog/ServiceCard';
import {
  humanizeCode,
  paiseToRupees,
} from '../../components/catalog/categoryIcons';
import { ServiceIllustration } from '../../components/catalog/ServiceIllustration';
import { illustrationFor } from '../../components/catalog/illustrations/resolve';
import { categoryForService } from '../../components/catalog/matchCategory';
import { useGetCategoriesQuery, useGetServicesQuery } from '../../services/api/catalogApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing, screenPadding } from '../../theme/spacing';
import type { ServiceCatalogItem } from '../../types/api';

function formatDuration(minutes?: number): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function ServiceDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const serviceCode = String(code);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // The catalog list is Redis-cached server-side and already in the RTK cache
  // from Home/Services, so this resolves instantly without another request.
  const { data: services = [], isLoading, error, refetch } = useGetServicesQuery();
  const { data: categories = [] } = useGetCategoriesQuery();

  const service = useMemo(
    () => services.find((s) => s.code === serviceCode) ?? null,
    [services, serviceCode],
  );

  const category = useMemo(
    () => (service ? categoryForService(service, categories) : null),
    [service, categories],
  );

  const related = useMemo(() => {
    if (!service) return [];
    return services
      .filter((s) => s.category === service.category && s.code !== service.code)
      .slice(0, 4);
  }, [services, service]);

  const openRelated = useCallback(
    (next: ServiceCatalogItem) => router.replace(`/service/${next.code}` as never),
    [router],
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.plainBar}>
          <IconButton
            icon={<ChevronLeft size={20} color={colors.textHeading} />}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
        </View>
        <View style={styles.body}>
          <Skeleton width="100%" height={170} borderRadius={radius.large} />
          <Skeleton width="65%" height={26} style={{ marginTop: spacing.lg }} />
          <Skeleton width="90%" height={13} style={{ marginTop: spacing.md }} />
          <Skeleton width="80%" height={13} style={{ marginTop: spacing.sm }} />
          <Skeleton width="45%" height={30} style={{ marginTop: spacing.xl }} />
        </View>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.plainBar}>
          <IconButton
            icon={<ChevronLeft size={20} color={colors.textHeading} />}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
        </View>
        <ErrorState
          message={getApiErrorMessage(error, 'We could not load this service.')}
          onRetry={refetch}
        />
      </View>
    );
  }

  // ── Missing / retired service ─────────────────────────────────────────────
  if (!service) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.plainBar}>
          <IconButton
            icon={<ChevronLeft size={20} color={colors.textHeading} />}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
        </View>
        <EmptyState
          icon={<SearchX size={28} color={colors.textMuted} />}
          title="Service unavailable"
          message="This service may have been renamed or is no longer offered."
          actionLabel="Browse all services"
          onAction={() => router.replace('/(tabs)/services')}
        />
      </View>
    );
  }

  // ── Derived, all from catalog data ────────────────────────────────────────
  const drawing = illustrationFor(service, service.category);
  const accent = category?.theme?.accent ?? zappy[600];
  const deep = category?.theme?.deep ?? zappy[900];

  const name = service.name || humanizeCode(service.code);
  const description = service.description || service.shortDescription;
  const artwork = service.coverImage || service.imageUrl;

  const fixedPrice = paiseToRupees(service.servicePricePaise);
  const minPrice = paiseToRupees(service.priceRangeMinPaise);
  const maxPrice = paiseToRupees(service.priceRangeMaxPaise);
  const inspectionFee = paiseToRupees(service.inspectionFeePaise);
  const isRange = fixedPrice <= 0 && maxPrice > minPrice;
  const hasPrice = fixedPrice > 0 || minPrice > 0;

  const duration = formatDuration(service.estimatedDurationMinutes);
  const checklist = service.checklist ?? [];
  const tools = service.requiredTools ?? [];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 132 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — category identity ─────────────────────────────────── */}
        <Gradient
          colors={[accent, deep]}
          style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}
        >
          <IconButton
            icon={<ChevronLeft size={20} color={colors.textInverse} />}
            onPress={() => router.back()}
            variant="plain"
            accessibilityLabel="Go back"
            style={styles.heroBack}
          />

          <View style={styles.heroArt}>
            {artwork ? (
              <Image
                source={{ uri: artwork }}
                style={styles.heroImage}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                accessibilityLabel={`${name} illustration`}
              />
            ) : (
              <View style={styles.heroIcon}>
                <ServiceIllustration name={drawing} size={64} onColor spotlight={false} />
              </View>
            )}
          </View>

          {category ? (
            <Text variant="label" color="rgba(255,255,255,0.8)" style={styles.heroCategory}>
              {category.customerLabel}
            </Text>
          ) : null}
          <Heading level={1} color={colors.textInverse}>
            {name}
          </Heading>
        </Gradient>

        <View style={styles.body}>
          {/* ── Quick facts ────────────────────────────────────────────── */}
          <View style={styles.chips}>
            {duration ? (
              <Chip
                label={duration}
                tone="neutral"
                icon={<Clock size={12} color={colors.textSecondary} />}
              />
            ) : null}
            {service.isFeatured ? <Chip label="Popular" tone="accent" /> : null}
            <Chip
              label="Verified pros"
              tone="success"
              icon={<ShieldCheck size={12} color={colors.successDark} />}
            />
          </View>

          {description ? (
            <Text variant="body" style={styles.description}>
              {description}
            </Text>
          ) : null}

          {/* ── Price ──────────────────────────────────────────────────── */}
          <Card variant="flat" style={styles.priceCard}>
            <Text variant="label">{isRange ? 'Typical range' : 'Starts at'}</Text>
            <View style={styles.priceRow}>
              <Text variant="display" color={colors.textHeading}>
                {hasPrice ? formatRupees(fixedPrice > 0 ? fixedPrice : minPrice) : 'On quote'}
              </Text>
              {isRange ? (
                <Text variant="heading3" color={colors.textSecondary}>
                  – {formatRupees(maxPrice)}
                </Text>
              ) : null}
            </View>

            {inspectionFee > 0 ? (
              <>
                <Divider style={styles.tightDivider} />
                <View style={styles.feeRow}>
                  <Info size={13} color={colors.textMuted} />
                  <Text variant="bodySmall" style={styles.flex}>
                    Includes a {formatRupees(inspectionFee)} inspection fee where a
                    diagnosis is needed.
                  </Text>
                </View>
              </>
            ) : null}

            <Text variant="caption" style={styles.priceNote}>
              Your final price is confirmed by a live quote once you set your location.
            </Text>
          </Card>

          {/* ── What's included ────────────────────────────────────────── */}
          {checklist.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle>What&apos;s included</SectionTitle>
              <Card variant="outline">
                {checklist.map((entry, index) => (
                  <View key={`${entry.item}-${index}`}>
                    {index > 0 ? <Divider style={styles.tightDivider} /> : null}
                    <View style={styles.itemRow}>
                      <View style={styles.checkDot}>
                        <Check size={12} color={colors.successDark} strokeWidth={3} />
                      </View>
                      <Text variant="body" style={styles.flex}>
                        {entry.item}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {/* ── What the pro brings ────────────────────────────────────── */}
          {tools.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle>What your pro brings</SectionTitle>
              <View style={styles.toolRow}>
                {tools.map((tool) => (
                  <Chip
                    key={tool}
                    label={tool}
                    tone="blue"
                    icon={<PackageCheck size={12} color={zappy[700]} />}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* `service.guidelines` is deliberately NOT rendered — see header. */}

          {/* ── Related ────────────────────────────────────────────────── */}
          {related.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle>Related services</SectionTitle>
              <View style={styles.relatedStack}>
                {related.map((item) => (
                  <ServiceCard
                    key={item.code}
                    service={item}
                    category={category}
                    onPress={openRelated}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* ── Sticky CTA ───────────────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.base) }]}>
        {hasPrice ? (
          <View style={styles.footerPrice}>
            <Text variant="label">{isRange ? 'From' : 'Starts at'}</Text>
            <Text variant="heading2">
              {formatRupees(fixedPrice > 0 ? fixedPrice : minPrice)}
            </Text>
          </View>
        ) : null}
        <Button
          label="Book now"
          onPress={() => router.push(`/book/${service.code}` as never)}
          size="large"
          fullWidth
          accessibilityLabel={`Book ${name}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: { paddingHorizontal: screenPadding, marginTop: spacing.lg },
  plainBar: { paddingHorizontal: screenPadding, paddingVertical: spacing.sm },

  hero: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.extraLarge,
    borderBottomRightRadius: radius.extraLarge,
  },
  heroBack: { backgroundColor: 'rgba(255,255,255,0.18)' },
  heroArt: { marginTop: spacing.base, alignItems: 'flex-start' },
  heroImage: {
    width: '100%',
    height: 140,
    borderRadius: radius.large,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.medium,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCategory: { marginTop: spacing.base, marginBottom: spacing.xxs },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  description: { marginTop: spacing.base },

  priceCard: { marginTop: spacing.lg },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  feeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  priceNote: { marginTop: spacing.sm },

  section: { marginTop: spacing.xl },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.successTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tightDivider: { marginVertical: 0 },
  toolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  relatedStack: { gap: spacing.md, marginTop: spacing.sm },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    gap: spacing.sm,
    ...shadows.softLarge,
  },
  footerPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
