import { StyleSheet, View } from 'react-native';
import { statusHeadline } from '@zappy/core/shared/trackingSteps';
import { Text } from '@zappy/ui/components';
import { accent, colors, ink, slate, success } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { TrackedJob } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// The headline of tracking (the website's StatusBlock): one sentence in large type, the minutes in colour, and this moment's rows.
export function StatusBlock({ job, status, eta, options, needsYou, children }: { job: TrackedJob; status: string; eta: number | null; options?: Any; needsYou?: boolean; children?: React.ReactNode }) {
  const h = statusHeadline(job, status, eta, { arrival: options?.arrival, moreTime: options?.moreTime, needsYou, payTo: options?.payTo || null });
  return (
    <View style={styles.block} accessibilityLiveRegion="polite">
      <Text variant="heading2" weight="extrabold" style={styles.title}>
        {h.title}
        {h.minutes != null ? <Text variant="heading2" weight="extrabold" color={h.late ? accent[600] : success[700]} style={styles.title}> {h.minutes} {h.minutes === 1 ? 'min' : 'mins'}</Text> : null}
      </Text>
      {h.sub ? <Text variant="body" color={ink[500]} style={styles.sub}>{h.sub}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: spacing.base, paddingTop: spacing.lg, paddingBottom: 4, backgroundColor: colors.surface, borderBottomWidth: 8, borderBottomColor: slate[100] },
  title: { fontSize: 23, lineHeight: 29, letterSpacing: -0.4 },
  sub: { marginTop: 6, marginBottom: spacing.md },
});
