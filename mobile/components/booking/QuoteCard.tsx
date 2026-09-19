/**
 * Quote card — the price summary of the booking flow.
 * ----------------------------------------------------------------------------
 * Renders every state the quote can be in: waiting for a location, loading,
 * loaded, and failed. The parent decides which; this component owns how each
 * one looks so the states can't drift apart visually.
 *
 * ── WHAT IS AND ISN'T SHOWN ────────────────────────────────────────────────
 * Charges are grouped by `normalizeQuote` into Service price / Additional
 * charges / Fees, and each group renders only when the server actually sent
 * something for it.
 *
 * There is NO taxes row, ever. The pricing engine emits no GST, VAT or tax
 * field for any vertical — every rupee key it can produce is enumerated in
 * `quote.ts`. A "Taxes" line would be a fabrication.
 *
 * There is NO discount amount either. `GET /orders/quote` carries none;
 * `discountPaise` is written to the ORDER after the promo is validated at
 * creation. So an applied promo is acknowledged in words and its value is left
 * to the server, which is the only thing that knows it.
 *
 * ── THE RECONCILIATION RULE ────────────────────────────────────────────────
 * The itemised breakdown appears ONLY when `linesReconcile` is true. For
 * several verticals the server's fee components do not add up to the total —
 * `car_wash` returns ₹50 + ₹1 against a total of ₹300, because the total is
 * floored to the catalog price — and showing them side by side would misstate
 * the bill. When they don't reconcile the card shows the total alone, which is
 * the figure the server will charge.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AlertCircle, Info, MapPin, Pencil, RefreshCw, Tag, Zap } from 'lucide-react-native';
import { Appear, Button, Card, Divider, SectionTitle, Text, formatRupees } from '../ui';
import type { BookingTierKey, NormalizedQuote } from './quote';
import { TIER_MULTIPLIERS } from './quote';
import { accent, colors } from '../../theme/colors';
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
  /** The price depends on the pin, so the card offers the way to change it. */
  onEditLocation?: () => void;
}

/**
 * Surge explainer.
 * ----------------------------------------------------------------------------
 * This replaced a one-line chip that read "1.35× surge pricing in effect" —
 * accurate, but it is jargon, and it left the two questions a customer
 * actually has unanswered: is this on top of the total, and is the total going
 * to move again?
 *
 * ── WHAT IT MAY AND MAY NOT SAY ────────────────────────────────────────────
 * `GET /orders/quote` returns a MULTIPLIER and nothing else. The website's
 * `SurgeInfoCard` shows a reason, live demand/supply counts, an ETA for the
 * surge to clear and a three-hour sparkline — all from a richer surge payload
 * this screen does not request and this phase does not add.
 *
 * So the copy describes the EFFECT only and never a cause. "Because more
 * customers are booking right now" would be a plausible guess and still a
 * fabrication: the multiplier alone does not establish why. The headline
 * wording is the website's own (`{n}× surge pricing`); the second line says
 * what it means for this total, which is the part the customer can act on.
 *
 * The multiplier is printed exactly as supplied, to one decimal like the web —
 * never recomputed, and never applied to the price here. The server already
 * folded it into `total`, which is why `quote.ts` classifies it as metadata
 * rather than a charge line.
 *
 * Thresholds mirror the website's `surgeLevel()` (1.3 / 1.7). Mobile has no
 * orange ramp, so high resolves to the deeper amber rather than inventing one;
 * red is reserved for a genuinely steep multiplier so the common case stays
 * calm rather than alarming.
 */
function SurgeNote({ multiplier }: { multiplier: number }) {
  const tone =
    multiplier > 1.7 ? colors.errorDark : multiplier > 1.3 ? accent[700] : colors.accentDark;

  return (
    <View style={styles.surgeNote}>
      <View style={styles.surgeIcon}>
        <Zap size={13} strokeWidth={2.2} color={tone} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="bold" color={tone}>
          {multiplier.toFixed(1)}× surge pricing
        </Text>
        <Text variant="caption" style={styles.surgeBody}>
          Prices in your area are higher than usual right now. This total already
          includes it.
        </Text>
      </View>
    </View>
  );
}

/** One `label … ₹value` row. */
function ChargeRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.line}>
      <Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
        {label}
      </Text>
      <Text variant="bodySmall" color={tone}>
        {value}
      </Text>
    </View>
  );
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
  onEditLocation,
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
            <Text variant="body" weight="semibold">
              Set your location for a price
            </Text>
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
            <Text variant="body" weight="semibold">
              Getting your price…
            </Text>
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
          <View style={[styles.stateIcon, { backgroundColor: colors.surface }]}>
            <AlertCircle size={18} color={colors.error} />
          </View>
          <View style={styles.flex}>
            <Text variant="body" weight="semibold">
              Couldn&apos;t get a price
            </Text>
            <Text variant="bodySmall" color={colors.textSecondary}>
              {errorMessage}
            </Text>
          </View>
        </View>
        <View style={styles.errorActions}>
          <Button
            label="Try again"
            variant="primary"
            size="small"
            icon={<RefreshCw size={15} color={colors.textInverse} />}
            onPress={onRetry}
          />
          {onEditLocation ? (
            <Button
              label="Edit location"
              variant="secondary"
              size="small"
              onPress={onEditLocation}
            />
          ) : null}
        </View>
      </Card>
    );
  }

  if (!quote) return null;

  // ── Loaded ────────────────────────────────────────────────────────────────
  // Tier and boost are the only client-side arithmetic here, both required by
  // the server's own surge-guard contract — see the booking screen's header.
  const tierTotal = Math.round(quote.total * TIER_MULTIPLIERS[tier]);
  const tierSurcharge = tierTotal - quote.total;
  const boost = Math.round(tipRupees);
  const payable = tierTotal + boost;

  const showBreakdown = quote.linesReconcile;
  const hasAdjustments = tierSurcharge > 0 || boost > 0;

  return (
    <Appear offsetY={6}>
      <Card variant="outline" style={styles.card}>
        {/* ── Grouped breakdown, when the server's own numbers add up ────── */}
        {showBreakdown
          ? quote.sections.map((section, index) => (
              <View key={section.group} style={index > 0 ? styles.sectionGap : undefined}>
                <SectionTitle style={styles.groupTitle}>{section.title}</SectionTitle>
                {section.lines.map((line) => (
                  <ChargeRow
                    key={line.key}
                    label={line.label}
                    value={formatRupees(line.value)}
                  />
                ))}
              </View>
            ))
          : null}

        {/* ── Adjustments this screen contributes ────────────────────────── */}
        {hasAdjustments ? (
          <View style={showBreakdown ? styles.sectionGap : undefined}>
            <SectionTitle style={styles.groupTitle}>Your choices</SectionTitle>
            {/* Without a reconciling breakdown the customer has no anchor for
                what the surcharge is a surcharge ON, so name the base here. */}
            {showBreakdown ? null : (
              <ChargeRow label="Service price" value={formatRupees(quote.total)} />
            )}
            {tierSurcharge > 0 ? (
              <ChargeRow
                label={`${tier === 'express' ? 'Express' : 'Priority'} matching`}
                value={`+${formatRupees(tierSurcharge)}`}
                tone={colors.accentDark}
              />
            ) : null}
            {boost > 0 ? (
              <ChargeRow
                label="Boost for your pro"
                value={`+${formatRupees(boost)}`}
                tone={colors.successDark}
              />
            ) : null}
          </View>
        ) : null}

        {/* ── TOTAL — the dominant element ───────────────────────────────── */}
        <View style={styles.totalBlock}>
          <View style={styles.totalRow}>
            <View style={styles.flex}>
              <Text variant="label" color={colors.primaryDark}>
                Estimated total
              </Text>
            </View>
            <Text variant="display" style={styles.totalValue}>
              {formatRupees(payable)}
            </Text>
          </View>

          {promoCode ? (
            <View style={styles.promoRow}>
              <Tag size={13} color={colors.successDark} />
              <Text variant="caption" color={colors.successDark} style={styles.flex}>
                {promoCode} applied — your discount comes off this total at booking.
              </Text>
            </View>
          ) : null}

          {/* Subordinate to the figure above, and only when there IS a surge. */}
          {quote.surgeMultiplier ? <SurgeNote multiplier={quote.surgeMultiplier} /> : null}
        </View>

        {/*
          ── What went into the price ──────────────────────────────────────
          The website lists these components — base visit fee, distance, night
          surcharge — and then prints "Total" beneath them. For car_wash those
          rows are ₹50 + ₹1 + ₹80 = ₹131 against a ₹300 total, because the
          total is floored to the service's catalog price and the components
          were only inputs to that decision. So the same fields are shown, but
          under a heading that says what they are rather than implying a sum
          the customer would find does not add up.

          Rendered only when the lines do NOT reconcile; when they do, the
          grouped breakdown above already carries them as real addends.
        */}
        {!showBreakdown && quote.lines.length > 0 ? (
          <View style={styles.inputsBlock}>
            <SectionTitle style={styles.groupTitle}>What went into this price</SectionTitle>
            {quote.lines.map((line) => (
              <ChargeRow
                key={line.key}
                label={line.label}
                value={formatRupees(line.value)}
              />
            ))}
            <Text variant="caption" color={colors.textMuted} style={styles.inputsNote}>
              These are the inputs Zappy priced from. The total above is the
              amount you pay.
            </Text>
          </View>
        ) : null}

        {/* ── Contextual facts — never money ─────────────────────────────── */}
        {quote.facts.length > 0 ? (
          <View style={styles.facts}>
            {quote.facts.map((fact) => (
              <View key={fact.key} style={styles.fact}>
                <Text variant="caption" color={colors.textMuted}>
                  {fact.label}
                </Text>
                <Text variant="caption" weight="semibold">
                  {fact.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Divider style={styles.footDivider} />

        {/* ── Caveats + the one action that changes the price ────────────── */}
        <View style={styles.notes}>
          {quote.note ? (
            <View style={styles.noteRow}>
              <Info size={13} color={colors.textMuted} />
              <Text variant="caption" color={colors.textSecondary} style={styles.flex}>
                {quote.note}
              </Text>
            </View>
          ) : null}
          <View style={styles.noteRow}>
            <Info size={13} color={colors.textMuted} />
            <Text variant="caption" color={colors.textSecondary} style={styles.flex}>
              Priced by Zappy for this address. Your pro confirms the final amount
              before any extra work.
            </Text>
          </View>
        </View>

        {onEditLocation ? (
          <Button
            label="Edit location"
            variant="ghost"
            size="small"
            icon={<Pencil size={14} color={colors.primary} />}
            onPress={onEditLocation}
            style={styles.editLocation}
          />
        ) : null}
      </Card>
    </Appear>
  );
}

export const QuoteCard = memo(QuoteCardBase);

const styles = StyleSheet.create({
  flex: { flex: 1 },

  card: { gap: 0 },
  stateCard: { gap: spacing.md },
  errorCard: { borderColor: colors.error, backgroundColor: colors.errorTint },
  errorActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },

  stateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stateIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },

  groupTitle: { marginBottom: spacing.xs },
  sectionGap: { marginTop: spacing.base },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 3,
  },

  // The total must survive a glance: its own tinted slab in Zappy blue, the
  // display type scale, and more visual weight than everything above it.
  totalBlock: {
    marginTop: spacing.lg,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.medium,
    padding: spacing.base,
    gap: spacing.sm,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  totalValue: { letterSpacing: -1 },
  promoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },

  // White surface on the tinted total block, so it reads as a note attached to
  // the figure rather than as a second price panel.
  surgeNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  surgeIcon: { paddingTop: 1 },
  surgeBody: { marginTop: 2 },

  inputsBlock: { marginTop: spacing.base },
  inputsNote: { marginTop: spacing.sm },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.base,
  },
  fact: { gap: 1 },

  footDivider: { marginTop: spacing.base, marginBottom: spacing.md },
  notes: { gap: spacing.xs },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },

  editLocation: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
