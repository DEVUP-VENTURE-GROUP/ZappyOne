/**
 * The team, and what each of them is holding. An owner's next question after
 * "what came in?" is "who can take it?", so this shows how many open jobs each
 * technician is carrying.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { UserPlus } from 'lucide-react-native';
import { Button, Text } from '@zappy/ui/components';
import { LinkButton, Panel } from '@zappy/ui/components/worker/DashboardUI';
import { ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface TeamWorker { _id: string; name?: string; phone?: string }

export function TeamPanel({ workers, jobs, onManage }: { workers: TeamWorker[]; jobs: { workerId?: string | null }[]; onManage: () => void }) {
  const load = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs) if (j.workerId) map.set(String(j.workerId), (map.get(String(j.workerId)) || 0) + 1);
    return map;
  }, [jobs]);

  return (
    <Panel title="Your team" action={<LinkButton label="Manage" onPress={onManage} />}>
      {!workers.length ? (
        <View style={styles.empty}>
          <UserPlus size={20} color={slate[300]} />
          <Text variant="bodySmall" weight="bold" color={ink[700]}>No technicians yet</Text>
          <Text variant="caption" color={ink[500]} style={styles.center}>Add your technicians so you can hand jobs to them instead of doing every one yourself.</Text>
          <Button label="Add a technician" size="small" onPress={onManage} />
        </View>
      ) : (
        <View style={styles.list}>
          {workers.slice(0, 5).map((w) => {
            const n = load.get(String(w._id)) || 0;
            return (
              <View key={w._id} style={styles.row}>
                <View style={styles.avatar}><Text variant="caption" weight="bold" color="#fff">{(w.name || '?').charAt(0).toUpperCase()}</Text></View>
                <View style={styles.flex}>
                  <Text variant="bodySmall" weight="bold" numberOfLines={1}>{w.name}</Text>
                  {w.phone ? <Text variant="caption" color={ink[400]}>{w.phone}</Text> : null}
                </View>
                <View style={[styles.load, { backgroundColor: n ? zappy[50] : success[50] }]}>
                  <Text variant="caption" weight="bold" color={n ? zappy[700] : success[700]}>{n ? `${n} job${n === 1 ? '' : 's'}` : 'Free'}</Text>
                </View>
              </View>
            );
          })}
          {workers.length > 5 ? (
            <Pressable onPress={onManage} hitSlop={6}><Text variant="caption" weight="bold" color={zappy[600]} style={styles.center}>+{workers.length - 5} more</Text></Pressable>
          ) : null}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: slate[50] },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[600] },
  flex: { flex: 1, minWidth: 0 },
  load: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  empty: { alignItems: 'center', gap: 6, padding: spacing.base, borderRadius: radius.medium, borderWidth: 1, borderStyle: 'dashed', borderColor: slate[200] },
  center: { textAlign: 'center' },
});
