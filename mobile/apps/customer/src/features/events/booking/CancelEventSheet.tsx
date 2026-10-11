/** Cancel an event booking with a reason. It can be cancelled only before the team is assigned, and then all of it comes back. */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCancelEventBookingMutation } from '@zappy/core/api';
import { BottomSheet, Button, Input, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { ink } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';

export function CancelEventSheet({ id, paid, visible, onClose }: { id: string; paid: boolean; visible: boolean; onClose: () => void }) {
  const [cancel, { isLoading }] = useCancelEventBookingMutation();
  const [reason, setReason] = useState('');

  async function run() {
    try { await cancel({ id, reason }).unwrap(); toast.success('Booking cancelled'); onClose(); }
    catch (err) { toast.error(errText(err, 'Could not cancel. Try again.')); }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Cancel this booking?">
      <View style={styles.body}>
        <Text variant="bodySmall" color={ink[500]}>{paid ? 'Everything you paid comes back to you.' : 'Nothing has been charged.'}</Text>
        <Input value={reason} onChangeText={setReason} maxLength={300} placeholder="Reason (optional)" />
        <Button label="Cancel booking" variant="danger" loading={isLoading} onPress={run} fullWidth />
        <Button label="Keep booking" variant="ghost" onPress={onClose} fullWidth />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ body: { gap: spacing.md } });
