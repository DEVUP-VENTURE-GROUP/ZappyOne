/**
 * Nobody free by the deadline (the website's SlowSearchCard; server
 * jobs/fast-assign): said plainly, with the three honest choices. Keep
 * searching (we already are), move it to a later time (jobs/reschedule), or
 * cancel free (the page's own cancel sheet). Shows itself when the search
 * clock reaches the deadline.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { CalendarClock } from 'lucide-react-native';
import { useRescheduleJobMutation } from '@zappy/core/api';
import { laterSlots, searchStage } from '@zappy/core/shared/searchClock';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function SlowSearchCard({ jobId, noun, search, reschedule, onCancel, onMoved }: {
  jobId: string; noun: string; search: Any; reschedule: Any; onCancel: (() => void) | null; onMoved?: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  const [move, { isLoading }] = useRescheduleJobMutation();
  const [moving, setMoving] = useState<string | null>(null);
  const [due, setDue] = useState(() => !!search?.toldAt || !!searchStage(search)?.overdue);

  useEffect(() => {
    if (due || !search?.startedAt) return undefined;
    const ms = new Date(search.startedAt).getTime() + search.deadlineSec * 1000 - Date.now();
    const t = setTimeout(() => setDue(true), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [due, search]);

  if (hidden || !due) return null;
  const slots: { label: string; at: string }[] = reschedule?.allowed ? laterSlots(reschedule.leadMinutes) : [];

  async function later(at: string) {
    setMoving(at);
    try { const r = await move({ id: jobId, scheduledAt: at }).unwrap(); toast.success(r.message); onMoved?.(); }
    catch (err) { toast.error(errText(err, 'Could not move it. Try again.')); }
    setMoving(null);
  }

  return (
    <View style={styles.card}>
      <Text variant="body" weight="bold" color={ink[900]}>No {noun} is free right now</Text>
      <Text variant="caption" color={accent[700]}>Everyone nearby is busy. We are still asking, and you can choose what happens next.</Text>
      {slots.length ? (
        <View style={styles.gap}>
          <View style={styles.row}><CalendarClock size={13} color={accent[700]} /><Text variant="caption" weight="semibold" color={accent[700]}>Book it for later instead</Text></View>
          <View style={styles.wrap}>
            {slots.map((s) => (
              <Pressable key={s.at} disabled={isLoading} onPress={() => later(s.at)} accessibilityRole="button" style={styles.slot}>
                {moving === s.at ? <ActivityIndicator size="small" color={ink[700]} /> : null}
                <Text variant="caption" weight="semibold" color={ink[900]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}><Button label="Keep searching" onPress={() => setHidden(true)} fullWidth /></View>
        {onCancel ? <View style={styles.flex}><Button label="Cancel free" variant="outline" onPress={onCancel} fullWidth /></View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, backgroundColor: accent[50], borderWidth: 1, borderColor: accent[100] },
  gap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: '#fff', borderWidth: 1, borderColor: accent[100] },
});
