import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { CalendarClock, X } from 'lucide-react-native';
import { useRescheduleJobMutation } from '@zappy/core/api';
import { laterSlots } from '@zappy/core/shared/searchClock';
import { Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, slate } from '@zappy/ui/theme/colors';
import type { TrackedJob } from '../types';
import { Row, Section } from './Section';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// UC's "Reschedule & cancel" (the website's RescheduleCancel): move a booking made for later, or cancel with the fee shown first.
export function RescheduleCancel({ job, reschedule, cancel, onCancel, onMoved }: { job: TrackedJob; reschedule?: Any; cancel?: { note?: string } | null; onCancel: () => void; onMoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [move] = useRescheduleJobMutation();
  const canMove = Boolean(job.scheduledAt && reschedule?.allowed);
  const slots: { label: string; at: string }[] = canMove && open ? laterSlots(reschedule.leadMinutes) : [];
  if (!canMove && !cancel && !(job.scheduledAt && reschedule?.reason)) return null;

  async function to(at: string) {
    setMoving(at);
    try { const r = await move({ id: job.id, scheduledAt: at }).unwrap(); toast.success(r.message); setOpen(false); onMoved(); }
    catch (err) { toast.error(errText(err, 'Could not move it. Try again.')); }
    setMoving(null);
  }

  return (
    <Section title={canMove || reschedule?.reason ? 'Reschedule and cancel' : 'Cancel booking'}>
      {job.scheduledAt && canMove ? (
        <>
          <Row first Icon={CalendarClock} title="Change the time" sub={`You can move it ${reschedule.left} more ${reschedule.left === 1 ? 'time' : 'times'}, up to ${reschedule.aheadDays} days ahead.`} onPress={() => setOpen((v) => !v)} />
          {open ? (
            <View style={styles.slots}>
              {slots.map((s) => (
                <Pressable key={s.at} onPress={() => to(s.at)} disabled={Boolean(moving)} accessibilityRole="button" style={[styles.slot, moving && styles.busy]}>
                  {moving === s.at ? <ActivityIndicator size="small" /> : null}
                  <Text variant="bodySmall" weight="semibold">{s.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : job.scheduledAt && reschedule?.reason ? <Row first Icon={CalendarClock} title="Change the time" sub={reschedule.reason} /> : null}
      {cancel ? <Row first={!job.scheduledAt || (!canMove && !reschedule?.reason)} Icon={X} title="Cancel this booking" sub={cancel.note || 'You see any fee before you confirm.'} onPress={onCancel} tone="danger" /> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 54, paddingBottom: 14 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  busy: { opacity: 0.5 },
});
