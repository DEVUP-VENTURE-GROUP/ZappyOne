/**
 * A job still in flight, any kind (the website's UpcomingCard). Amber means
 * it is stopped until the customer acts (a quote to approve), so it outranks
 * everything else on the screen.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { MyJob } from './types';

export const UpcomingCard = memo(function UpcomingCard({ job }: { job: MyJob }) {
  const router = useRouter();
  const t = useT();
  const tone = job.needsYou ? accent : zappy;
  return (
    <Pressable onPress={() => router.push(job.href as never)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.card, job.needsYou && { borderColor: accent[500] }]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: tone[500] }]} />
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.cap}>{t(job.titleKey, job.title)}</Text>
          {job.address ? <Text variant="caption" color={ink[400]} numberOfLines={1}>{job.address}</Text> : null}
        </View>
        <View style={[styles.pill, { backgroundColor: tone[50] }]}><Text variant="caption" weight="bold" color={tone[700]}>{job.needsYou ? t('activity.approve', 'Approve') : t(job.statusKey, job.stage)}</Text></View>
      </View>
      <View style={[styles.row, styles.foot]}>
        {job.totalPaise != null ? <Text variant="body" weight="black">{formatPaise(job.totalPaise)}</Text> : <Text variant="caption" weight="semibold" color={ink[500]}>{job.stage}</Text>}
        <View style={styles.row}><Text variant="caption" weight="bold" color={tone[700]}>{t('activity.track', 'Track')}</Text><ArrowRight size={13} color={tone[700]} /></View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  foot: { justifyContent: 'space-between', marginTop: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
});
