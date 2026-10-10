/** A past job on one scannable line (the website's CompactRow): icon, title, outcome, when, total, rating, and Rebook. */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Repeat2, Star } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { jobIcon } from '@zappy/ui/components/jobs/jobIcons';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { fmtTime } from './activityDates';
import { StatusPill } from './StatusPill';
import type { MyJob } from './types';

export const CompactRow = memo(function CompactRow({ job, last }: { job: MyJob; last: boolean }) {
  const router = useRouter();
  const t = useT();
  const Icon = jobIcon(job.iconCode);
  const title = t(job.titleKey, job.title);
  return (
    <View style={[styles.row, !last && styles.rule]}>
      <Pressable onPress={() => router.push(job.href as never)} accessibilityRole="button" accessibilityLabel={`Open ${title}`} style={styles.main}>
        <View style={styles.icon}><Icon size={20} color={ink[500]} strokeWidth={1.7} /></View>
        <View style={styles.flex}>
          <View style={styles.inline}><Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.title}>{title}</Text><StatusPill job={job} /></View>
          <View style={styles.inline}>
            <Text variant="caption" color={ink[500]}>{fmtTime(job.createdAt)} · </Text>
            <Text variant="caption" weight="semibold">{formatPaise(job.totalPaise)}</Text>
            {job.rating ? <><Star size={10} color={accent[500]} fill={accent[500]} /><Text variant="caption" color={ink[500]}>{job.rating}</Text></> : null}
          </View>
        </View>
      </Pressable>
      {job.rebookHref ? (
        <Pressable onPress={() => router.push(job.rebookHref as never)} accessibilityRole="button" accessibilityLabel={`${t('activity.rebook', 'Rebook')} ${title}`} style={styles.rebook}>
          <Repeat2 size={16} color={ink[500]} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rule: { borderBottomWidth: 1, borderBottomColor: colors.border },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  icon: { width: 44, height: 44, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { flexShrink: 1, textTransform: 'capitalize' },
  rebook: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
});
