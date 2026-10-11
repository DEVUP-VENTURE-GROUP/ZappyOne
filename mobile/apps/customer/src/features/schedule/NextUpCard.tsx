/** The soonest booking ahead (the website's NextUpCard): its date, what and where, a live countdown, add to calendar, change time. */
import { Pressable, StyleSheet, View } from 'react-native';
import { CalendarDays, CalendarPlus, Clock, MapPin } from 'lucide-react-native';
import { KIND_LABEL, calendarLink, canMove, dayLabel, timeLabel, untilLabel } from '@zappy/core/shared/schedule';
import { Text } from '@zappy/ui/components';
import { jobIcon } from '@zappy/ui/components/jobs/jobIcons';
import { useT } from '@zappy/ui/lib/i18n';
import { openLink } from '@zappy/ui/lib/openLink';
import { zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { ScheduleItem } from './scheduleTypes';

const SOFT = 'rgba(255,255,255,0.8)';
const FAINT = 'rgba(255,255,255,0.15)';

export function NextUpCard({ item, now, onOpen, onMove }: { item: ScheduleItem; now: number; onOpen: () => void; onMove: () => void }) {
  const t = useT();
  const at = new Date(item.when);
  const Icon = jobIcon(item.iconCode || item.kind);
  return (
    <View style={styles.card}>
      <Pressable onPress={onOpen} accessibilityRole="button" style={styles.body}>
        <View style={styles.top}>
          <View style={styles.date}>
            <Text variant="caption" weight="semibold" color={SOFT}>{at.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</Text>
            <Text variant="heading1" weight="black" color="#fff">{at.getDate()}</Text>
            <Text variant="caption" color={SOFT}>{at.toLocaleDateString('en-IN', { weekday: 'short' })}</Text>
          </View>
          <View style={styles.flex}>
            <View style={styles.kind}><Icon size={12} color="#fff" /><Text variant="caption" weight="semibold" color="#fff">{KIND_LABEL[item.kind as keyof typeof KIND_LABEL] || 'Booking'}</Text></View>
            <Text variant="body" weight="bold" color="#fff" numberOfLines={1} style={styles.cap}>{item.title}</Text>
            <View style={styles.inline}><Clock size={13} color={SOFT} /><Text variant="caption" color={SOFT}>{dayLabel(at)} · {item.slot || timeLabel(at)}</Text></View>
            {item.address ? <View style={styles.inline}><MapPin size={12} color={SOFT} /><Text variant="caption" color={SOFT} numberOfLines={1} style={styles.flex}>{item.address}</Text></View> : null}
          </View>
        </View>
        <View style={styles.countdown}>
          <Text variant="caption" weight="medium" color={SOFT}>{t('schedule.starts', 'Starts')}</Text>
          <Text variant="bodySmall" weight="bold" color="#fff">{untilLabel(at.getTime() - now)}</Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable onPress={() => openLink(calendarLink(item))} accessibilityRole="button" style={styles.action}>
          <CalendarPlus size={15} color="#fff" /><Text variant="caption" weight="semibold" color="#fff">{t('schedule.addCal', 'Add to calendar')}</Text>
        </Pressable>
        {canMove(item) ? (
          <Pressable onPress={onMove} accessibilityRole="button" style={[styles.action, styles.divider]}>
            <CalendarDays size={15} color="#fff" /><Text variant="caption" weight="semibold" color="#fff">{t('schedule.changeTime', 'Change time')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: 24, backgroundColor: zappy[700] },
  body: { gap: spacing.base, padding: spacing.lg },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.base },
  date: { width: 64, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.large, backgroundColor: FAINT },
  flex: { flex: 1, minWidth: 0 },
  kind: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: FAINT, marginBottom: 4 },
  cap: { textTransform: 'capitalize' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  countdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.large, backgroundColor: 'rgba(255,255,255,0.1)' },
  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: FAINT },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md },
  divider: { borderLeftWidth: 1, borderLeftColor: FAINT },
});
