/** A repeating booking (the website's RepeatRow): how often, the next one, and skip, pause, resume or stop. */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Repeat2 } from 'lucide-react-native';
import { useRepeatActionMutation } from '@zappy/core/api';
import { Chip, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface RepeatPlan { _id: string; title: string; everyLabel: string; nextLabel?: string; status: string; lastError?: string }

export function RepeatRow({ plan }: { plan: RepeatPlan }) {
  const t = useT();
  const [act, { isLoading }] = useRepeatActionMutation();
  const paused = plan.status === 'paused';
  const run = async (action: string, done: string) => {
    try { await act({ planId: plan._id, action }).unwrap(); toast.success(done); }
    catch (err) { toast.error(errText(err, t('repeat.failed', 'Could not change it. Try again.'))); }
  };
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: paused ? slate[100] : zappy[50] }]}><Repeat2 size={18} color={paused ? ink[400] : zappy[600]} /></View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.cap}>{plan.title}</Text>
          <Text variant="caption" color={ink[500]}>{plan.everyLabel.charAt(0).toUpperCase() + plan.everyLabel.slice(1)} · {paused ? t('repeat.paused', 'paused') : `${t('repeat.next', 'next')} ${plan.nextLabel}`}</Text>
          {plan.lastError && !paused ? <Text variant="caption" color={accent[700]}>{t('repeat.retry', 'Last try did not go through; we will try again.')}</Text> : null}
        </View>
        {isLoading ? <ActivityIndicator size="small" color={slate[400]} /> : null}
      </View>
      <View style={styles.chips}>
        {!paused ? <Chip label={t('repeat.skip', 'Skip next')} onPress={() => !isLoading && run('skip', t('repeat.skipped', 'Next one skipped'))} /> : null}
        {paused ? <Chip label={t('repeat.resume', 'Resume')} tone="blue" onPress={() => !isLoading && run('resume', t('repeat.resumed', 'Repeat resumed'))} />
          : <Chip label={t('repeat.pause', 'Pause')} onPress={() => !isLoading && run('pause', t('repeat.pausedToast', 'Repeat paused'))} />}
        <Chip label={t('repeat.stop', 'Stop')} tone="red" onPress={() => !isLoading && run('stop', t('repeat.stopped', 'Repeat stopped'))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
