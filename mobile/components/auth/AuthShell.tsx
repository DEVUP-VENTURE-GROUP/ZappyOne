/**
 * Auth shell — the framing shared by login and OTP.
 * ----------------------------------------------------------------------------
 * Ports the website's sign-in surface to native: a pale blue field with two
 * oversized soft circles and a dotted grid, and a single white card floating
 * in the middle carrying the logo, the greeting and the form.
 *
 * The decoration is built from plain Views rather than SVG or an image. Two
 * circles and a 5×5 dot grid do not justify a rasterised asset that would need
 * @2x/@3x variants, and Views keep it resolution-independent for free. All of
 * it is `pointerEvents="none"` so nothing competes with the form for touches.
 *
 * The card keeps a max width so the layout still reads as a card on a tablet
 * instead of stretching edge to edge.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, ZappyLogo } from '../ui';
import { colors, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';

export interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Rendered under the card, outside it — e.g. the role switch link. */
  footer?: React.ReactNode;
}

/** 5×5 dotted grid, matching the website's top-left motif. */
const DotGrid = memo(function DotGrid() {
  return (
    <View style={styles.dotGrid} pointerEvents="none">
      {Array.from({ length: 5 }, (_, row) => (
        <View key={row} style={styles.dotRow}>
          {Array.from({ length: 5 }, (__, col) => (
            <View key={col} style={styles.dot} />
          ))}
        </View>
      ))}
    </View>
  );
});

function AuthShellBase({ title, subtitle, children, footer }: AuthShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      {/* ── Decoration ───────────────────────────────────────────────────── */}
      <View style={styles.circleTopRight} pointerEvents="none" />
      <View style={styles.circleBottomLeft} pointerEvents="none" />
      <View style={[styles.dotWrap, { top: insets.top + spacing.xl }]} pointerEvents="none">
        <DotGrid />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {/* ZappyLogo defaults to white for dark/gradient surfaces. On a
                white card that leaves only the amber pin visible, so the ink
                is set to the brand blue here. */}
            <ZappyLogo size={40} color={colors.primary} />

            <Text variant="heading1" align="center" style={styles.title}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="body" color={colors.textSecondary} align="center">
                {subtitle}
              </Text>
            ) : null}

            <View style={styles.body}>{children}</View>
          </View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export const AuthShell = memo(AuthShellBase);

/** Pale wash behind everything — the website's sign-in field. */
const FIELD = '#F1F4FD';
/** The soft circles. Deliberately low-contrast; they must not pull focus. */
const BLOB = '#E2E9FB';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: FIELD },
  flex: { flex: 1 },

  circleTopRight: {
    position: 'absolute',
    top: -140,
    right: -120,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: BLOB,
  },
  circleBottomLeft: {
    position: 'absolute',
    bottom: -160,
    left: -130,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: BLOB,
  },

  dotWrap: { position: 'absolute', left: spacing.xl },
  dotGrid: { gap: 12 },
  dotRow: { flexDirection: 'row', gap: 12 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: zappy[200] },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    ...shadows.softLarge,
  },
  title: { marginTop: spacing.lg, marginBottom: spacing.xxs },
  body: { width: '100%', marginTop: spacing.xl },

  footer: { marginTop: spacing.xl, alignItems: 'center', paddingHorizontal: spacing.lg },
});
