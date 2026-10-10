/**
 * What has happened on the job, newest first, from the real status history
 * (the website's ActivityFeed). The latest step is a live blue dot while the
 * job runs; every earlier step is a tick. New steps slide in on top.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { fmtTime } from '@zappy/core/shared/trackingSteps';
import { Text } from '@zappy/ui/components';
import { colors, ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface FeedEvent { status: string; at: string; text: string }

export function ActivityFeed({ events, live }: { events: FeedEvent[]; live: boolean }) {
  if (!events.length) return null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text variant="body" weight="bold">Live updates</Text>
        {live ? <View style={styles.inline}><View style={styles.liveDot} /><Text variant="caption" weight="semibold" color={ink[400]}>Live</Text></View> : null}
      </View>
      {events.map((e, i) => {
        const current = i === 0 && live;
        const last = i === events.length - 1;
        return (
          <Animated.View key={`${e.status}-${e.at}`} entering={FadeInDown.duration(300)} style={styles.row}>
            <View style={styles.rail}>
              {current ? <View style={styles.now}><View style={styles.nowCore} /></View> : <View style={styles.tick}><Check size={12} color="#fff" strokeWidth={3} /></View>}
              {!last ? <View style={styles.line} /> : null}
            </View>
            <View style={[styles.body, !last && styles.bodyGap]}>
              <Text variant="bodySmall" weight={current ? 'bold' : 'medium'} color={current ? ink[900] : ink[700]}>{e.text}</Text>
              <Text variant="caption" color={ink[400]}>{fmtTime(e.at)}</Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: success[600] },
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { width: 20, alignItems: 'center' },
  now: { width: 20, height: 20, marginTop: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  nowCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: zappy[600] },
  tick: { width: 20, height: 20, marginTop: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[600] },
  line: { width: 2, flex: 1, marginVertical: 4, borderRadius: 1, backgroundColor: zappy[600] },
  body: { flex: 1, minWidth: 0 },
  bodyGap: { paddingBottom: spacing.base },
});
