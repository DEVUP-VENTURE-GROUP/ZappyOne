/**
 * The rows of Your schedule (the website's LiveRow and BookingRow): a booking
 * happening now, one tap to track it; a booking ahead with its time, add to
 * calendar, and change the time where it can move.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CalendarPlus, ChevronRight } from 'lucide-react-native';
import { KIND_LABEL, calendarLink, canMove, timeLabel } from '@zappy/core/shared/schedule';
import { Text } from '@zappy/ui/components';
import { jobIcon } from '@zappy/ui/components/jobs/jobIcons';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { openLink } from '@zappy/ui/lib/openLink';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { ScheduleItem } from './scheduleTypes';

export const LiveRow = memo(function LiveRow({ item, onOpen }: { item: ScheduleItem; onOpen: () => void }) {
  const t = useT();
  const Icon = jobIcon(item.iconCode || item.kind);
  return (
    <Pressable onPress={onOpen} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.row, styles.live]}>
      <View style={[styles.icon, { backgroundColor: success[50] }]}><Icon size={18} color={success[600]} /><View style={styles.pulse} /></View>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.cap}>{item.title}</Text>
        <Text variant="caption" color={ink[500]} numberOfLines={1}>{item.stage || t('schedule.inProgress', 'In progress')}</Text>
      </View>
      <View style={styles.track}><Text variant="caption" weight="semibold" color="#fff">{t('activity.track', 'Track')}</Text></View>
    </Pressable>
  );
});

export const BookingRow = memo(function BookingRow({ item, onOpen, onMove }: { item: ScheduleItem; onOpen: () => void; onMove: () => void }) {
  const t = useT();
  const at = new Date(item.when);
  const [time, ampm] = timeLabel(at).split(' ');
  const Icon = jobIcon(item.iconCode || item.kind);
  return (
    <View style={styles.row}>
      <Pressable onPress={onOpen} accessibilityRole="button" style={styles.main}>
        <View style={styles.when}>
          <Text variant="bodySmall" weight="bold" color={zappy[700]}>{item.slot ? String(at.getDate()) : time}</Text>
          <Text variant="caption" weight="semibold" color={zappy[500]}>{item.slot ? at.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase() : (ampm || '').toUpperCase()}</Text>
        </View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.cap}>{item.title}</Text>
          <View style={styles.inline}><Icon size={12} color={ink[400]} /><Text variant="caption" color={ink[500]}>{t(`kind.${item.kind}`, KIND_LABEL[item.kind as keyof typeof KIND_LABEL] || 'Booking')}{item.slot ? ` · ${item.slot}` : ''}</Text></View>
        </View>
      </Pressable>
      <Pressable onPress={() => openLink(calendarLink(item))} accessibilityRole="button" accessibilityLabel={t('schedule.addCal', 'Add to calendar')} hitSlop={6} style={styles.cal}>
        <CalendarPlus size={16} color={ink[500]} />
      </Pressable>
      {canMove(item) ? (
        <Pressable onPress={onMove} accessibilityRole="button" style={styles.change}><Text variant="caption" weight="semibold" color={zappy[700]}>{t('schedule.change', 'Change')}</Text></Pressable>
      ) : <ChevronRight size={16} color={slate[300]} />}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  live: { borderColor: success[100] },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  icon: { width: 44, height: 44, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.surface, backgroundColor: success[500] },
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  track: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: success[600] },
  when: { width: 48, alignItems: 'center', paddingVertical: 6, borderRadius: radius.medium, backgroundColor: zappy[50] },
  cal: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  change: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
});
