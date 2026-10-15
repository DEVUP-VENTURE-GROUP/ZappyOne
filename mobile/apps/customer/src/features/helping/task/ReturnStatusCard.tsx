/** A return's product and order, and where the merchant's refund stands. */
import { StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, danger, ink, slate, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const REFUND: Record<string, [string, string, string]> = {
  unknown: ['Not yet handed over', slate[100], ink[700]],
  not_applicable: ['Not applicable', slate[100], ink[700]],
  pending_merchant: ['Handed over, waiting on the merchant', accent[100], accent[700]],
  refund_confirmed: ['Merchant confirmed the refund', success[50], success[700]],
  refund_failed: ['Merchant did not process this', danger[50], danger[600]],
};

export function ReturnStatusCard({ detail }: { detail: { productName: string; merchantName?: string; orderId?: string; refundStatus?: string } }) {
  const t = useT();
  const [label, bg, fg] = REFUND[detail.refundStatus || 'unknown'] || REFUND.unknown;
  return (
    <View style={styles.card}>
      <Text variant="body" weight="bold">{detail.productName}</Text>
      <Text variant="bodySmall" color={ink[500]}>{[detail.merchantName, detail.orderId ? `Order ${detail.orderId}` : ''].filter(Boolean).join(', ')}</Text>
      <View style={[styles.pill, { backgroundColor: bg }]}><Text variant="caption" weight="bold" color={fg}>{t(`refund.${detail.refundStatus || 'unknown'}`, label)}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pill: { alignSelf: 'flex-start', marginTop: spacing.sm, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
});
