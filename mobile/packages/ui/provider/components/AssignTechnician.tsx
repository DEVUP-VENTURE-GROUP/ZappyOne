/**
 * A shop hands a job to one of its technicians (the websites' AssignTechnician).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, UserPlus } from 'lucide-react-native';
import { useShopWorkersQuery, useAssignJobTechnicianMutation } from '@zappy/core/api';
import { Text } from '../../components';
import { toast } from '../../components/Toast';
import { RIPPLE, errText } from '../../lib/feedback';
import { colors, zappy, ink, slate, success } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

/** `busy` is { [workerId]: open job count }, so work goes to whoever is free. */
export function AssignTechnician({ jobId, workerId, busy = {}, onDone, startOpen = false }: { jobId: string; workerId?: string | null; busy?: Record<string, number>; onDone?: () => void; startOpen?: boolean }) {
  const { data } = useShopWorkersQuery();
  const [assign, { isLoading }] = useAssignJobTechnicianMutation();
  const [open, setOpen] = useState(startOpen);
  type W = { _id: string; name: string; isOnline?: boolean; isBlocked?: boolean };
  const workers: W[] = [...(data?.workers || [])].filter((w: W) => !w.isBlocked).sort((a: W, b: W) => Number(!!b.isOnline) - Number(!!a.isOnline) || (busy[a._id] || 0) - (busy[b._id] || 0));
  const current = workers.find((w) => String(w._id) === String(workerId));

  async function give(id: string) {
    try {
      const res = await assign({ id: jobId, workerId: id }).unwrap();
      toast.success(`${res.workerName || 'Technician'} has the job - they have been told`);
      setOpen(false);
      onDone?.();
    } catch (err) { toast.error(errText(err, 'Could not assign that technician')); }
  }
  if (!data) return null;
  if (!workers.length) return <Text variant="caption" color={ink[400]}>Add technicians to your team to hand jobs to them.</Text>;
  return (
    <View style={styles.gap}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.row} hitSlop={6}>
        <UserPlus size={13} color={zappy[600]} /><Text variant="caption" weight="bold" color={zappy[600]}>{current ? `On ${current.name}, change` : 'Assign a technician'}</Text>
      </Pressable>
      {open ? workers.map((w) => {
        const isCurrent = String(w._id) === String(workerId);
        return (
          <Pressable key={w._id} onPress={() => give(w._id)} disabled={isLoading || isCurrent} android_ripple={RIPPLE}
            style={[styles.tech, isCurrent ? { borderColor: success[100], backgroundColor: success[50] } : null]}>
            <View style={[styles.onlineDot, { backgroundColor: w.isOnline ? success[500] : slate[300] }]} />
            <Text variant="bodySmall" weight="semibold" style={styles.flex} numberOfLines={1}>{w.name}</Text>
            <Text variant="caption" color={ink[400]}>{w.isOnline ? 'online' : 'offline'}{busy[w._id] ? `, ${busy[w._id]} job${busy[w._id] === 1 ? '' : 's'}` : ''}</Text>
            {isCurrent ? <Check size={13} color={success[600]} /> : null}
          </Pressable>
        );
      }) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gap: { gap: spacing.sm },
  tech: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 44 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
});
