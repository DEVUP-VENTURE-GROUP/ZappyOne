/**
 * A job open to take on the work board: what, where, when, the pay, and Take.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MapPin, Banknote, Sparkles } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '..';
import { RIPPLE } from '../../lib/feedback';
import { colors, ink, success, accent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { STAFF_APP } from '../../provider/staffApp';

export interface OpenJob {
  kind: string; id: string; service: string; title: string; where?: string; to?: string;
  km?: number | null; earningPaise: number; boostPaise?: number; frontPaise?: number; at?: string | null;
}

export const when = (at?: string | null) => (at ? new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null);

/* Open work: what it pays and how far, before they commit. */
export function OpenJobCard({ job, busy, onTake }: { job: OpenJob; busy?: boolean; onTake: () => void }) {
  const boost = !STAFF_APP && (job.boostPaise ?? 0) > 0;
  return (
    <View style={[styles.open, boost ? styles.openBoost : null]}>
      {boost ? (
        <View style={styles.boostBar}>
          <Sparkles size={13} color={accent[700]} />
          <Text variant="caption" weight="extrabold" color={accent[700]}>Customer raised the offer by {formatPaise(job.boostPaise)}, all yours</Text>
        </View>
      ) : null}
      <View style={styles.openHead}>
        <View style={styles.flex}>
          <Text variant="caption" weight="semibold" color={colors.primary} style={styles.capitalize}>{job.service}</Text>
          <Text variant="body" weight="semibold" numberOfLines={1} style={styles.capitalize}>{job.title}</Text>
        </View>
        {STAFF_APP ? null : (
          <View style={styles.right}>
            <Text variant="heading3" weight="bold" color={success[700]}>{formatPaise(job.earningPaise)}</Text>
            <Text variant="caption" color={colors.textSecondary}>you earn</Text>
            {boost ? <Text variant="caption" weight="semibold" color={accent[700]}>incl. +{formatPaise(job.boostPaise)} extra</Text> : null}
          </View>
        )}
      </View>
      {job.where ? (
        <View style={styles.rowTop}>
          <MapPin size={14} color={ink[400]} style={styles.mt2} />
          <Text variant="bodySmall" color={ink[700]} style={styles.flex}>
            {job.where}{job.to ? <Text variant="bodySmall" color={ink[400]}> → {job.to}</Text> : null}
          </Text>
        </View>
      ) : null}
      {[job.km != null ? `${job.km} km away` : null, when(job.at)].filter(Boolean).length ? (
        <Text variant="bodySmall" color={colors.textSecondary}>{[job.km != null ? `${job.km} km away` : null, when(job.at)].filter(Boolean).join(', ')}</Text>
      ) : null}
      {(job.frontPaise ?? 0) > 0 ? (
        <View style={styles.front}>
          <Banknote size={14} color={accent[700]} />
          <Text variant="caption" weight="medium" color={accent[700]} style={styles.flex}>You pay {formatPaise(job.frontPaise)} at the shop; the customer repays against the receipt</Text>
        </View>
      ) : null}
      <Pressable onPress={onTake} disabled={busy} accessibilityRole="button" accessibilityLabel={STAFF_APP ? 'Take this job' : `Take this job, ${formatPaise(job.earningPaise)}`}
        android_ripple={RIPPLE} style={[styles.take, busy && styles.dim]}>
        <Text variant="button" color={colors.textInverse}>Take this job</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  right: { alignItems: 'flex-end' },
  mt2: { marginTop: 2 },
  capitalize: { textTransform: 'capitalize' },
  dim: { opacity: 0.6 },
  open: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.md, overflow: 'hidden' },
  openBoost: { borderColor: accent[500], borderWidth: 2 },
  boostBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: accent[100], marginHorizontal: -spacing.base, marginTop: -spacing.base, paddingHorizontal: spacing.base, paddingVertical: 6 },
  openHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  front: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: accent[50], borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  take: { backgroundColor: colors.primary, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
});
