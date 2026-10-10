/**
 * The tracking page's header for every job kind (the website's
 * TrackingHeader): what (service and reference), where it stands (status,
 * ETA), and the few actions that belong here (SOS, support).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Clock, Headphones, ShieldAlert } from 'lucide-react-native';
import { STATUS_PILL, shortId } from '@zappy/core/shared/trackingSteps';
import { Text } from '@zappy/ui/components';
import { colors, danger, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { TrackedJob } from '../types';

function IconAction({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={styles.action}>{children}</Pressable>;
}

export function TrackingHeader({ job, eta, onBack, onSOS, onSupport }: { job: TrackedJob; eta: number | null; onBack: () => void; onSOS?: () => void; onSupport?: () => void }) {
  const insets = useSafeAreaInsets();
  const pill = STATUS_PILL[job.status as keyof typeof STATUS_PILL] || STATUS_PILL.searching;
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.action}><ArrowLeft size={19} color={ink[900]} /></Pressable>
        <View style={styles.flex}>
          <Text variant="body" weight="bold" numberOfLines={1} style={styles.cap}>{job.service}</Text>
          <Text variant="caption" color={ink[500]} numberOfLines={1}>{job.reference || `#${shortId(job.id)}`}{job.subtitle ? ` · ${job.subtitle}` : ''}</Text>
        </View>
        {!job.terminal && job.provider && onSOS ? <IconAction label="Emergency SOS" onPress={onSOS}><ShieldAlert size={18} color={danger[600]} /></IconAction> : null}
        {onSupport ? <IconAction label="Support" onPress={onSupport}><Headphones size={18} color={ink[700]} /></IconAction> : null}
      </View>
      <View style={styles.chips}>
        <View style={[styles.chip, { backgroundColor: pill.live ? success[50] : slate[100] }]}>
          {pill.live ? <View style={styles.dot} /> : null}
          <Text variant="caption" weight="semibold" color={pill.live ? success[700] : ink[700]}>{job.statusLabel || pill.label}</Text>
        </View>
        {!job.terminal && eta != null && ['assigned', 'on_the_way'].includes(job.status) ? (
          <View style={[styles.chip, { backgroundColor: zappy[50] }]}><Clock size={12} color={zappy[700]} /><Text variant="caption" weight="semibold" color={zappy[700]}>About {eta} min</Text></View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.base, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  action: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: success[600] },
});
