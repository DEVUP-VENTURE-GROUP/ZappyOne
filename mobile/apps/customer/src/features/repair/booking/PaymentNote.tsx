/**
 * How the money works for this booking, said plainly (the website's
 * PaymentNote). The apps take no online payment, so an unpaid online booking
 * is settled in cash with the technician, who records it.
 */
import { StyleSheet, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { billAddOnsPaise, formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { colors, ink, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const CLOSED = ['CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED', 'REJECTED'];

interface Booking { status: string; paymentStatus?: string; paymentMethod?: string; cashCollectedAt?: string; priceSnapshot?: { totalPaise?: number; isEstimate?: boolean } }

export function PaymentNote({ booking }: { booking: Booking }) {
  const snap = booking.priceSnapshot || {};
  const due = (snap.totalPaise || 0) + billAddOnsPaise(booking);
  let title = '';
  let body = '';
  if (booking.paymentStatus === 'paid') {
    return <View style={[styles.card, styles.row]}><ShieldCheck size={14} color={success[700]} /><Text variant="bodySmall" weight="bold" color={success[700]}>Paid{booking.cashCollectedAt ? ' in cash' : ''}</Text></View>;
  }
  if (CLOSED.includes(booking.status)) title = 'Nothing to pay';
  else if (snap.isEstimate && booking.status !== 'APPROVED') { title = 'You pay once you approve the quote'; body = 'The technician sends a quote first. Nothing is charged before you approve it.'; }
  else { title = 'Pay in cash when the job is done'; body = `Hand ${formatPaise(due)} to the technician after they finish. Nothing is charged before that, and they cannot close the job without recording it.`; }
  return (
    <View style={styles.card}>
      <Text variant="bodySmall" weight="bold">{title}</Text>
      {body ? <Text variant="caption" color={ink[500]}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
