/**
 * Every stage of the job on one rail (the website's PremiumTimeline): done
 * stages ticked with their time, the current one ringed with "Now", the rest
 * waiting. The last stage reached counts as done, not in progress.
 */
import { StyleSheet, View } from 'react-native';
import { CheckCircle, Clock, Zap } from 'lucide-react-native';
import { fmtTime } from '@zappy/core/shared/trackingSteps';
import { Text } from '@zappy/ui/components';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Step { key: string; label: string; desc: string }

export function PremiumTimeline({ steps, activeStepIdx, timesByStatus }: { steps: Step[]; activeStepIdx: number; timesByStatus: Record<string, string> }) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text variant="body" weight="black">Live status</Text>
        <View style={styles.badge}><Zap size={12} color={zappy[700]} fill={zappy[700]} /><Text variant="caption" weight="bold" color={zappy[700]}>Real-time</Text></View>
      </View>
      {steps.map((s, i) => {
        const finalReached = activeStepIdx === steps.length - 1 && i === steps.length - 1;
        const done = activeStepIdx > i || finalReached;
        const current = activeStepIdx === i && !finalReached;
        const at = timesByStatus[s.key];
        const last = i === steps.length - 1;
        return (
          <View key={s.key} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.node, done ? styles.nodeDone : current ? styles.nodeNow : styles.nodeWait]}>
                {done ? <CheckCircle size={16} color="#fff" /> : <View style={current ? styles.coreNow : styles.coreWait} />}
              </View>
              {!last ? <View style={[styles.line, { backgroundColor: done ? zappy[600] : slate[100] }]} /> : null}
            </View>
            <View style={[styles.body, !last && styles.bodyGap]}>
              <View style={styles.titleRow}>
                <Text variant="bodySmall" weight={current ? 'black' : 'bold'} color={current ? zappy[700] : done ? ink[900] : ink[400]} style={styles.flex}>{s.label}</Text>
                <Text variant="caption" weight="semibold" color={current ? zappy[600] : ink[400]}>{current ? 'Now' : at ? fmtTime(at) : ''}</Text>
              </View>
              {current || done ? <Text variant="caption" color={ink[500]}>{s.desc}</Text> : null}
              {done ? <View style={[styles.tag, { backgroundColor: success[50] }]}><CheckCircle size={11} color={success[700]} /><Text variant="caption" weight="black" color={success[700]}>Completed</Text></View> : null}
              {current ? <View style={[styles.tag, { backgroundColor: zappy[50] }]}><Clock size={11} color={zappy[700]} /><Text variant="caption" weight="black" color={zappy[700]}>In progress</Text></View> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.small, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: zappy[50] },
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center' },
  node: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nodeDone: { backgroundColor: zappy[600] },
  nodeNow: { backgroundColor: zappy[500], borderWidth: 4, borderColor: zappy[100] },
  nodeWait: { backgroundColor: slate[100], borderWidth: 1.5, borderColor: slate[200] },
  coreNow: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#fff' },
  coreWait: { width: 7, height: 7, borderRadius: 4, backgroundColor: slate[300] },
  line: { width: 2.5, flex: 1, minHeight: 22, marginVertical: 3, borderRadius: 2 },
  body: { flex: 1, minWidth: 0, gap: 3, paddingTop: 6 },
  bodyGap: { paddingBottom: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, borderRadius: radius.small, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
});
