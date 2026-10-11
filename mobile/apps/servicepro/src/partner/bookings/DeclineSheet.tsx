/**
 * Decline a new request (the events website's decline dialog): what it costs
 * the partner is shown first (server events/partner-cancel), the customer is
 * refunded in full and sees the reason.
 */
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useDeclineEventBookingMutation, useEventDeclineQuoteQuery } from '@zappy/core/api';
import { BottomSheet, Button, Input, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function DeclineSheet({ id, visible, onClose }: { id: string; visible: boolean; onClose: () => void }) {
  const { data: quote } = useEventDeclineQuoteQuery(id, { skip: !visible });
  const [decline, { isLoading }] = useDeclineEventBookingMutation();
  const [reason, setReason] = useState('');

  async function run() {
    try {
      await decline({ id, reason: reason.trim() || 'Partner unavailable' }).unwrap();
      toast.success('Booking declined. The customer is refunded in full.');
      onClose();
    } catch (err) { toast.error(errText(err, 'Could not decline. Try again.')); }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Decline this booking?">
      <View style={styles.body}>
        <Text variant="bodySmall" color={ink[500]}>The customer gets a full refund.</Text>
        {quote?.quote ? (
          <View style={styles.note}><Text variant="bodySmall" weight="semibold" color={accent[700]}>{quote.quote.message}</Text></View>
        ) : <View style={styles.row}><ActivityIndicator size="small" color={zappy[600]} /><Text variant="caption" color={ink[500]}>Checking what it costs…</Text></View>}
        <Input value={reason} onChangeText={setReason} maxLength={300} multiline multilineHeight={64} placeholder="Reason (the customer sees this)" />
        <Button label="Decline" variant="danger" loading={isLoading} disabled={!quote?.quote} onPress={run} fullWidth />
        <Button label="Keep it" variant="ghost" onPress={onClose} fullWidth />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  note: { padding: spacing.md, borderRadius: radius.medium, backgroundColor: accent[50] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
