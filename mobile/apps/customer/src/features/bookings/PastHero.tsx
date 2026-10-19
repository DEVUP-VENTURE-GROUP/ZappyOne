/**
 * The last completed job, featured (the website's PastHero): when, total,
 * rating, and Rate / Rebook / Invoice. Only a completed job gets this card; a cancelled
 * one would get undue weight.
 */
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, FileDown, Repeat2, Star } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '@zappy/ui/components';
import { jobIcon } from '@zappy/ui/components/jobs/jobIcons';
import { useI18n } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, navy, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { dateBucket, fmtTime } from './activityDates';
import { StatusPill } from './StatusPill';
import type { MyJob } from './types';

export function PastHero({ job }: { job: MyJob }) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const Icon = jobIcon(job.iconCode);
  return (
    <View style={styles.card}>
      <View style={styles.banner}>
        <Icon size={34} color="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        <View style={styles.badge}><CheckCircle2 size={10} color={success[700]} /><Text variant="caption" weight="bold" color={success[700]}>{t('activity.lastCompleted', 'Last completed').toUpperCase()}</Text></View>
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="heading3" weight="bold" style={styles.title}>{t(job.titleKey, job.title)}</Text>
          <StatusPill job={job} />
        </View>
        <Text variant="bodySmall" color={ink[500]}>{dateBucket(job.createdAt, t, lang)}, {fmtTime(job.createdAt)}</Text>
        <View style={styles.inline}>
          <Text variant="bodySmall" weight="bold">{formatPaise(job.totalPaise)}</Text>
          {job.rating ? <><Star size={11} color={accent[500]} fill={accent[500]} /><Text variant="caption" color={ink[500]}>{job.rating}</Text></> : null}
        </View>
        <View style={styles.actions}>
          {job.rating == null ? <Button label={t('activity.rate', 'Rate')} size="small" variant="outline" icon={<Star size={14} color={ink[900]} />} onPress={() => router.push(job.href as never)} /> : null}
          {job.canInvoice ? <Button label={t('activity.invoice', 'Invoice')} size="small" variant="ghost" icon={<FileDown size={14} color={ink[500]} />} onPress={() => router.push(`/bill?source=order&id=${job.id}` as never)} /> : null}
          {job.rebookHref ? <Button label={t('activity.rebook', 'Rebook')} size="small" variant="outline" icon={<Repeat2 size={14} color={ink[900]} />} onPress={() => router.push(job.rebookHref as never)} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  banner: { height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: navy[800] },
  badge: { position: 'absolute', top: spacing.md, left: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#fff' },
  body: { gap: 4, padding: spacing.base },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, textTransform: 'capitalize' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
