import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarClock, Zap } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { colors, danger, ink, slate, success } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { TrackedJob } from '../types';

const when = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Service name with how it was booked, and Help and SOS (the website's TrackingHeader).
export function TrackingHeader({ job, onBack, onSOS, onSupport }: { job: TrackedJob; onBack: () => void; onSOS?: () => void; onSupport?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}><ArrowLeft size={22} color={ink[900]} /></Pressable>
      <View style={styles.flex}>
        <Text variant="bodyLarge" weight="bold" numberOfLines={1} style={styles.cap}>{job.service}</Text>
        {job.scheduledAt ? (
          <View style={styles.sub}><CalendarClock size={13} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[500]}>{when(job.scheduledAt)}</Text></View>
        ) : (
          <View style={styles.sub}><Zap size={13} color={success[700]} fill={success[700]} strokeWidth={0} /><Text variant="caption" weight="semibold" color={success[700]}>Instant</Text></View>
        )}
      </View>
      {onSupport ? (
        <Pressable onPress={onSupport} accessibilityRole="button" style={styles.btn}><Text variant="bodySmall" weight="semibold">Help</Text></Pressable>
      ) : null}
      {!job.terminal && job.provider && onSOS ? (
        <Pressable onPress={onSOS} accessibilityRole="button" accessibilityLabel="Emergency SOS" style={styles.btn}><Text variant="bodySmall" weight="bold" color={danger[600]}>SOS</Text></Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: slate[200], backgroundColor: colors.surface },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btn: { height: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: slate[200], alignItems: 'center', justifyContent: 'center' },
});
