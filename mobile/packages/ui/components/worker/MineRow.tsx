/**
 * One of the provider's own jobs in a list: what, where, and its stage.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '..';
import { RIPPLE } from '../../lib/feedback';
import { colors, ink, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { StagePill } from './DashboardUI';

export interface MineJob { kind: string; id: string; to: string; title: string; subtitle?: string; status: string; attention?: boolean }

/* A job in hand: what, where, which stage. */
export function MineRow({ job, onPress, compact = false }: { job: MineJob; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${job.title}, ${job.status}`}
      android_ripple={RIPPLE} style={[styles.mine, compact ? styles.mineCompact : styles.mineCard]}>
      <View style={styles.flex}>
        <Text variant="body" weight="semibold" numberOfLines={1} style={styles.capitalize}>{job.title}</Text>
        {job.subtitle ? <Text variant="bodySmall" color={colors.textSecondary} numberOfLines={1} style={styles.capitalize}>{job.subtitle}</Text> : null}
      </View>
      <StagePill label={job.status} attention={job.attention} />
      <ChevronRight size={16} color={ink[400]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  capitalize: { textTransform: 'capitalize' },
  mine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mineCard: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.base, paddingVertical: spacing.md, minHeight: 60 },
  mineCompact: { backgroundColor: slate[50], borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
});
