/** Where one service's verification stands, as a small chip. */
import { View, StyleSheet } from 'react-native';
import { AlertTriangle, Ban, Check, Clock, FileText } from 'lucide-react-native';
import { Text } from '../../../components';
import { accent, danger, ink, slate, success } from '../../../theme/colors';
import { radius } from '../../../theme/radius';

const STATUS_META = {
  draft: { label: 'Not submitted', Icon: FileText, bg: slate[100], fg: ink[500] },
  pending_review: { label: 'Under review', Icon: Clock, bg: accent[50], fg: accent[700] },
  approved: { label: 'Approved', Icon: Check, bg: success[50], fg: success[700] },
  rejected: { label: 'Needs changes', Icon: AlertTriangle, bg: danger[50], fg: danger[600] },
  suspended: { label: 'Paused', Icon: Ban, bg: danger[50], fg: danger[600] },
} as const;

export function StatusChip({ status }: { status?: string | null }) {
  const meta = status ? STATUS_META[status as keyof typeof STATUS_META] : null;
  if (!meta) return null;
  return (
    <View style={[styles.chip, { backgroundColor: meta.bg }]}>
      <meta.Icon size={11} color={meta.fg} />
      <Text variant="caption" weight="bold" color={meta.fg}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
