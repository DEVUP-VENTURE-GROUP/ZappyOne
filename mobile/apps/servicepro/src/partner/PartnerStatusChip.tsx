/** A booking's state as the partner reads it (the events website's StatusChip). */
import { StyleSheet, View } from 'react-native';
import { PARTNER_STATUS_LABEL } from '@zappy/core/shared/partnerBookings';
import { Text } from '@zappy/ui/components';
import { accent, danger, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';

const TONE: Record<string, [string, string]> = {
  pending_payment: [slate[100], ink[700]],
  confirmed: [accent[50], accent[700]],
  partner_assigned: [zappy[50], zappy[700]],
  in_progress: [zappy[50], zappy[700]],
  completed: [success[50], success[700]],
  cancelled: [danger[50], danger[600]],
  disputed: [danger[50], danger[600]],
};

export function PartnerStatusChip({ status }: { status: string }) {
  const [bg, fg] = TONE[status] || TONE.pending_payment;
  const label = (PARTNER_STATUS_LABEL as Record<string, string>)[status] || status;
  return <View style={[styles.chip, { backgroundColor: bg }]}><Text variant="caption" weight="bold" color={fg}>{label}</Text></View>;
}

const styles = StyleSheet.create({ chip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill } });
