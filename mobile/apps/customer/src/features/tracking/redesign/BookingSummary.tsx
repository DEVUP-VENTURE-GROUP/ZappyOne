/**
 * Service, address, when, payment, every line the server recorded, and the
 * total (the website's BookingSummary). Zero lines are left out; a negative
 * line is a deduction.
 */
import { StyleSheet, View } from 'react-native';
import { Clock, FileText, MapPin, Wallet, Zap } from 'lucide-react-native';
import { rupeesOf } from '@zappy/core/shared/trackingSteps';
import { Button, Text } from '@zappy/ui/components';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { TrackedJob } from '../types';

function SummaryRow({ icon, k, v, right }: { icon: React.ReactNode; k: string; v: string; right?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.flex}>
        <Text variant="caption" weight="semibold" color={ink[500]}>{k}</Text>
        <Text variant="bodySmall" weight="bold" numberOfLines={2} style={styles.cap}>{v}</Text>
      </View>
      {right}
    </View>
  );
}

export function BookingSummary({ job, onReceipt }: { job: TrackedJob; onReceipt?: () => void }) {
  const price = job.price;
  const when = job.scheduledAt || job.createdAt;
  const whenLabel = when ? new Date(when).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-';
  const lines = price.lines.filter(([, paise]) => paise);
  return (
    <View style={styles.card}>
      <Text variant="body" weight="black">Booking summary</Text>
      <SummaryRow icon={<Zap size={17} color={ink[500]} />} k="Service" v={job.service}
        right={job.subtitle ? <View style={styles.right}><Text variant="caption" weight="semibold" color={ink[500]}>{job.subtitleLabel || 'For'}</Text><Text variant="bodySmall" weight="bold" numberOfLines={1}>{job.subtitle}</Text></View> : null} />
      <SummaryRow icon={<MapPin size={17} color={ink[500]} />} k="Address" v={job.place.address || '-'} />
      <SummaryRow icon={<Clock size={17} color={ink[500]} />} k={job.scheduledAt ? 'Scheduled' : 'Booked'} v={whenLabel}
        right={price.method ? <View style={styles.method}><Wallet size={14} color={zappy[600]} /><Text variant="caption" weight="bold">{price.method}</Text></View> : null} />
      {lines.length || price.totalPaise != null ? (
        <View style={styles.lines}>
          {lines.map(([label, paise]) => (
            <View key={label} style={styles.line}>
              <Text variant="caption" color={ink[500]}>{label}</Text>
              <Text variant="caption" weight="bold" color={paise < 0 ? success[700] : ink[700]}>{paise < 0 ? `− ${rupeesOf(-paise)}` : rupeesOf(paise)}</Text>
            </View>
          ))}
          {price.totalPaise != null ? (
            <View style={[styles.line, styles.total]}>
              <Text variant="bodySmall" weight="bold">{price.isEstimate ? 'Estimated total' : `Total ${price.paid ? 'paid' : 'payable'}`}</Text>
              <Text variant="heading2" weight="black">{rupeesOf(price.totalPaise)}</Text>
            </View>
          ) : null}
          {price.note ? <Text variant="caption" color={ink[500]}>{price.note}</Text> : null}
        </View>
      ) : null}
      {onReceipt ? <Button label="Download receipt" variant="outline" icon={<FileText size={16} color={zappy[600]} />} onPress={onReceipt} fullWidth /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 38, height: 38, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[50] },
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  right: { maxWidth: '45%', alignItems: 'flex-end' },
  method: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.medium, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: slate[50] },
  lines: { gap: 2, marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1.5, borderStyle: 'dashed', borderTopColor: colors.border },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  total: { marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
});
