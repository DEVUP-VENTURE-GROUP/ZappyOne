/**
 * Quote card — the price panel of the booking flow.
 * ----------------------------------------------------------------------------
 * Renders every state the quote can be in: waiting for a location, loading,
 * loaded, and failed. The parent decides which; this component owns how each
 * one looks so the states can't drift apart visually.
 *
 * The itemised breakdown appears ONLY when `linesReconcile` is true. See
 * `quote.ts` — for several verticals the server's fee components do not add up
 * to the total (the total is floored to the catalog price), and showing them
 * side by side would misstate the bill. When they don't reconcile the card
 * shows the total alone, which is the figure the server will actually charge.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AlertCircle, Info, MapPin, RefreshCw, Zap } from 'lucide-react-native';
import { Appear, Button, Card, Divider, SectionTitle, Text, formatRupees } from '../ui';
import type { BookingTierKey, NormalizedQuote } from './quote';
import { TIER_MULTIPLIERS } from './quote';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export interface QuoteCardProps {
  quote: NormalizedQuote | null;
  loading: boolean;
  /** Null when there's nothing to report. */
  errorMessage: string | null;
  /** False before a location is set — the quote can't be requested yet. */
  hasLocation: boolean;
  tier: BookingTierKey;
  /** Pre-acceptance boost, in rupees. Server adds it before its surge check. */
  tipRupees?: number;
  /** Applied promo, if any. The server, not this card, computes the discount. */
  promoCode?: string | null;
  onRetry: () => void;
}

function QuoteCardBase({
  quote,
  loading,
  errorMessage,
  hasLocation,
  tier,
  tipRupees = 0,
  promoCode,
  onRetry,
}: QuoteCardProps) {
  // ── No location yet ───────────────────────────────────────────────────────
  if (!hasLocation) {
    return (
      <Card variant="outline" style={styles.stateCard}>
        <View style={styles.stateRow}>
          <View style={[styles.stateIcon, { backgroundColor: colors.surfaceTertiary }]}>
            <MapPin size={18} color={colors.textMuted} />
          </View>
          <View style={styles.flex}>
            <Text variant="body" weight="semibold">Set your location for a price</Text>
            <Text variant="bodySmall" color={colors.textSecondary}>
              Pricing depends on where your pro has to travel.
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card variant="outline" style={styles.stateCard}>
        <View style={styles.stateRow}>
          <View style={[styles.stateIcon, { backgroundColor: colors.primaryTint }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text variant="body" weight="semibold">Getting your price…</Text>
            <Text variant="bodySmall" color={colors.textSecondary}>
              Checking rates for your area.
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (errorMessage) {
    return (
      <Card variant="outline" style={[styles.stateCard, styles.errorCard]}>
        <View style={styles.stateRow}>
          <View style={[styles.stateIcon, { backgroundColor: colors.errorTint }]}>
            <AlertCircle size={18} color={colors.error} />
          </View>
          <View style={styles.flex}>
            <Text variant="body" weight="semibold">Couldn't get a price</Text>
            <Text variant="bodySmall" color={colors.textSecondary}>
              {errorMessage}
            </Text>
          </View>
        </View>
        <Button
          label="Try again"
          variant="secondary"
          size="small"
          icon={<RefreshCw size={15} color={colors.primary} />}
          onPress={onRetry}
          style={styles.retry}
        />
      </Card>
    );
  }

  if (!quote) return null;

  // ── Loaded ────────────────────────────────────────────────────────────────
  const multiplier = TIER_MULTIPLIERS[tier];
  const tierTotal = Math.round(quote.total * multiplier);
  const tierSurcharge = tierTotal - quote.total;
  const payable = tierTotal + Math.round(tipRupees);

  return (
    <Appear offsetY={6}>
      <Card variant="outline" style={styles.card}>
        {/* Breakdown — only when the server's own numbers add up. */}
        {quote.linesReconcile ? (
          <>
            {quote.lines.map((line) => (
              <View key={line.key} style={styles.line}>
                <Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
                  {line.label}
                </Text>
                <Text variant="bodySmall">{formatRupees(line.value)}</Text>
              </View>
            ))}
            <Divider style={styles.divider} />
          </>
        ) : null}

        {/* Tier surcharge is shown separately because the quote endpoint takes
            no tier — the server applies this multiplier when it creates the
            order. Labelling it keeps the arithmetic on screen honest. */}
        {tierSurcharge > 0 ? (
          <>
            <View style={styles.line}>
              <Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
                Service price
              </Text>
              <Text variant="bodySmall">{formatRupees(quote.total)}</Text>
            </View>
            <View style={styles.line}>
              <Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
                {tier === 'express' ? 'Express' : 'Priority'} matching
              </Text>
              <Text variant="bodySmall" color={colors.accentDark}>
                +{formatRupees(tierSurcharge)}
              </Text>
            </View>
          </>
        ) : null}

        {tipRupees > 0 ? (
          <View style={styles.line}>
            <Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
              Boost for your pro
            </Text>
            <Text variant="bodySmall" color={colors.successDark}>
              +{formatRupees(tipRupees)}
            </Text>
          </View>
        ) : null}

        {tierSurcharge > 0 || tipRupees > 0 ? <Divider style={styles.divider} /> : null}

        {/* The headline figure. Always the server's total, tier and boost aside. */}
        <View style={styles.totalRow}>
          <View style={styles.flex}>
            <SectionTitle style={styles.totalLabel}>Estimated total</SectionTitle>
            {quote.surgeMultiplier ? (
              <View style={styles.surgeRow}>
                <Zap size={12} color={colors.accentDark} />
                <Text variant="caption" color={colors.accentDark}>
                  {quote.surgeMultiplier}× surge pricing in effect
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="heading1">{formatRupees(payable)}</Text>
        </View>

        {/* Contextual facts — distance, warranty, crew. Never money. */}
        {quote.facts.length > 0 ? (
          <View style={styles.facts}>
            {quote.facts.map((fact) => (
              <View key={fact.key} style={styles.fact}>
                <Text variant="caption" color={colors.textMuted}>
                  {fact.label}
                </Text>
                <Text variant="caption" weight="semibold">{fact.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Caveats. The promo line is a promise about who computes what — the
            discount is applied server-side at order creation, so no figure is
            shown here that this screen would have had to invent. */}
        <View style={styles.notes}>
          {quote.note ? (
            <View style={styles.noteRow}>
              <Info size={13} color={colors.textMuted} />
              <Text variant="caption" color={colors.textSecondary} style={styles.flex}>
                {quote.note}
              </Text>
            </View>
          ) : null}
          {promoCode ? (
            <View style={styles.noteRow}>
              <Info size={13} color={colors.successDark} />
              <Text variant="caption" color={colors.successDark} style={styles.flex}>
                {promoCode} is applied — the discount comes off your final bill.
              </Text>
            </View>
          ) : null}
          <View style={styles.noteRow}>
            <Info size={13} color={colors.textMuted} />
            <Text variant="caption" color={colors.textSecondary} style={styles.flex}>
              This is an estimate. Your pro confirms the final amount before any
              extra work.
            </Text>
          </View>
        </View>
      </Card>
    </Appear>
  );
}

export const QuoteCard = memo(QuoteCardBase);

const styles = StyleSheet.create({
  flex: { flex: 1 },

  card: { gap: spacing.xs },
  stateCard: { gap: spacing.md },
  errorCard: { borderColor: colors.errorTint, backgroundColor: colors.errorTint },

  stateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stateIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retry: { alignSelf: 'flex-start' },

  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  divider: { marginVertical: spacing.sm },

  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  totalLabel: { marginBottom: 0 },
  surgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: 2 },

  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  fact: { gap: 1 },

  notes: { gap: spacing.xs, marginTop: spacing.base },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
});
