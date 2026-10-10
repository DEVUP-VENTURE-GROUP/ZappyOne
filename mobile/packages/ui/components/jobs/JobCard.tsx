/**
 * The card and small heading every job screen is built from.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '..';
import { colors, ink, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

/** A plain card. */
export function JobCard({ children, tone, style }: { children: React.ReactNode; tone?: 'amber' | 'green' | 'red'; style?: object }) {
  const t = tone === 'amber' ? { backgroundColor: accent[50], borderColor: accent[100] }
    : tone === 'green' ? { backgroundColor: success[50], borderColor: success[100] }
      : tone === 'red' ? { backgroundColor: danger[50], borderColor: danger[100] } : null;
  return <View style={[styles.card, t, style]}>{children}</View>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text variant="caption" weight="bold" color={ink[500]} style={styles.eyebrow}>{children}</Text>;
}

const styles = StyleSheet.create({
  eyebrow: { letterSpacing: 0.8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
});
