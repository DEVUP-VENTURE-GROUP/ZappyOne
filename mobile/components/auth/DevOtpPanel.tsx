/**
 * Development-only OTP panel.
 * ----------------------------------------------------------------------------
 * Sits directly above the OTP boxes in development builds and shows the code
 * the server already returned, with one tap to fill it in.
 *
 * ── IT MUST NOT LOOK LIKE A PRODUCT FEATURE ────────────────────────────────
 * A dashed amber border, an "DEV ONLY" badge and developer-toned copy. The
 * design system's cards are solid with soft shadows, so a dashed outline reads
 * as "this is scaffolding" at a glance and cannot be mistaken for a real
 * affordance. It never says "your OTP" — the code is a development convenience,
 * not something the user was sent.
 *
 * ── IT CANNOT REACH PRODUCTION ─────────────────────────────────────────────
 * The component returns `null` before anything else when `__DEV__` is false,
 * and every call site is additionally wrapped in `{__DEV__ ? … : null}`. Metro
 * substitutes a literal `false` for `__DEV__` in release builds, so both checks
 * are constant-folded and the panel is unreachable.
 *
 * Nothing here logs the code, stores it, or sends it anywhere. It renders it
 * and hands it to the caller's `onFill`.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { TriangleAlert, WandSparkles } from 'lucide-react-native';
import { ScalePressable, Text } from '../ui';
import { accent, colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import type { DevOtpState } from '../../lib/devOtp';

export interface DevOtpPanelProps {
  state: DevOtpState;
  /** Given the code to place into the OTP boxes. */
  onFill: (code: string) => void;
}

function DevOtpPanelBase({ state, onFill }: DevOtpPanelProps) {
  // First line of defence — constant-folded away in a release build.
  if (!__DEV__) return null;
  if (state.kind === 'off') return null;

  const badge = (
    <View style={styles.badge}>
      <Text variant="caption" weight="bold" color={accent[700]} style={styles.badgeText}>
        DEV ONLY
      </Text>
    </View>
  );

  // The server answered but sent no code: the SMS provider is configured (or
  // this is a production backend), so there is nothing to offer.
  if (state.kind === 'missing') {
    return (
      <View style={[styles.panel, styles.panelMuted]}>
        <View style={styles.headRow}>
          {badge}
          <TriangleAlert size={13} color={accent[700]} />
        </View>
        <Text variant="caption" color={colors.textSecondary} style={styles.body}>
          SMS provider is not configured in this development environment, and the
          API returned no development code for this number.
        </Text>
        <Text variant="caption" color={colors.textMuted} style={styles.hint}>
          Read the code from the API server log, then type it above. Verification
          is unchanged.
        </Text>
      </View>
    );
  }

  return (
    <ScalePressable
      onPress={() => onFill(state.code)}
      accessibilityRole="button"
      accessibilityLabel={`Use development code ${state.code.split('').join(' ')}`}
      accessibilityHint="Fills the code boxes above. Verification still runs normally."
    >
      <View style={styles.panel}>
        <View style={styles.headRow}>
          {badge}
          <Text variant="caption" color={colors.textMuted}>
            Development OTP
          </Text>
        </View>

        <Text variant="heading3" color={colors.textHeading} style={styles.code}>
          {state.code}
        </Text>

        <View style={styles.actionRow}>
          <WandSparkles size={13} color={colors.primary} />
          <Text variant="caption" weight="semibold" color={colors.primary}>
            Use Dev OTP — tap to fill
          </Text>
        </View>
      </View>
    </ScalePressable>
  );
}

export const DevOtpPanel = memo(DevOtpPanelBase);

const styles = StyleSheet.create({
  panel: {
    // Dashed, not solid: every real card in the system has a solid edge, so
    // this reads as scaffolding rather than product.
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: accent[500],
    backgroundColor: colors.accentTint,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginBottom: spacing.base,
    gap: spacing.xs,
  },
  panelMuted: { borderColor: colors.borderStrong },

  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    backgroundColor: accent[100],
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 9, lineHeight: 14, letterSpacing: 0.6 },

  code: { letterSpacing: 6, marginTop: spacing.xxs },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  body: { lineHeight: 17, marginTop: spacing.xxs },
  hint: { lineHeight: 16, marginTop: spacing.xxs },
});
