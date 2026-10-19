/**
 * Change a booking's time (the website's MoveSheet): the server says whether
 * it can move and how many changes are left; pick a day and a half-hour from
 * the shared slot rules, then move it.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useJobOptionsQuery, useRescheduleJobMutation, useRescheduleOrderMutation } from '@zappy/core/api';
import { dayLabel, movesThroughJobs, timeLabel } from '@zappy/core/shared/schedule';
import { BottomSheet, Button, Skeleton, Text } from '@zappy/ui/components';
import { SlotPicker } from '@zappy/ui/components/booking/SlotPicker';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { ScheduleItem } from './scheduleTypes';

export function MoveSheet({ item, onClose }: { item: ScheduleItem; onClose: () => void }) {
  const t = useT();
  const generic = movesThroughJobs(item);
  const { data: options, isLoading: checking } = useJobOptionsQuery({ id: item.id, status: 'move' }, { skip: !generic });
  const [moveJob, { isLoading: movingJob }] = useRescheduleJobMutation();
  const [moveOrder, { isLoading: movingOrder }] = useRescheduleOrderMutation();
  const [picked, setPicked] = useState<Date | null>(null);
  const rule = generic ? options?.reschedule : { allowed: true };

  async function confirm() {
    if (!picked) return;
    try {
      if (generic) toast.success((await moveJob({ id: item.id, scheduledAt: picked.toISOString() }).unwrap()).message);
      else { await moveOrder({ id: item.id, scheduledAt: picked.toISOString() }).unwrap(); toast.success(`Moved to ${dayLabel(picked)}, ${timeLabel(picked)}`); }
      onClose();
    } catch (err) { toast.error(errText(err, t('schedule.moveFailed', 'Could not change the time. Try again.'))); }
  }

  return (
    <BottomSheet visible onClose={onClose} title={t('schedule.changeTime', 'Change time')} heightFraction={0.8}>
      <View style={styles.body}>
        <View>
          <Text variant="body" weight="bold" style={styles.cap} numberOfLines={1}>{item.title}</Text>
          <Text variant="caption" color={ink[500]}>{t('schedule.now', 'Now')} {dayLabel(item.when)}, {timeLabel(item.when)}</Text>
        </View>
        {generic && checking ? <View style={{ gap: 8 }}><Skeleton height={14} width="80%" /><Skeleton height={14} width="60%" /><Skeleton height={40} /></View> : !rule?.allowed ? (
          <View style={styles.blocked}><Text variant="bodySmall" color={accent[700]}>{rule?.reason || t('schedule.cannotMove', 'This booking cannot be moved now.')}</Text></View>
        ) : (
          <>
            <SlotPicker value={picked} onChange={setPicked} days={7} leadMinutes={30} fromHour={8} toHour={20} />
            {generic && rule?.left != null ? <Text variant="caption" color={ink[500]}>{t('schedule.left', 'You can change the time {n} more time(s). If someone is already coming, we tell them at once.').replace('{n}', String(rule.left))}</Text> : null}
            <Button label={picked ? `${t('schedule.moveTo', 'Move to')} ${dayLabel(picked)}, ${timeLabel(picked)}` : t('schedule.pick', 'Pick a time')}
              disabled={!picked} loading={movingJob || movingOrder} onPress={confirm} fullWidth />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.base, paddingBottom: spacing.xl },
  cap: { textTransform: 'capitalize' },
  blocked: { padding: spacing.base, borderRadius: radius.large, backgroundColor: accent[50] },
});
