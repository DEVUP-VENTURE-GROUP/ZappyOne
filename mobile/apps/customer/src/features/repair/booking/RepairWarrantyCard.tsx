/**
 * The warranty on a finished repair (the website's RepairWarrantyCard): until
 * when it runs, and a claim inside that window. One open claim per booking.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { useClaimRepairWarrantyMutation, useRepairWarrantyQuery } from '@zappy/core/api';
import { Button, Input, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const CLAIM_STATUS: Record<string, string> = {
  submitted: 'Claim received. We reply within a day',
  under_review: 'We are looking into your claim',
  approved: 'Claim approved. We will arrange the fix free',
  rejected: 'Claim not covered',
  resolved: 'Claim resolved',
};

export function RepairWarrantyCard({ booking }: { booking: { _id: string; status: string } }) {
  const done = booking.status === 'COMPLETED';
  const { data } = useRepairWarrantyQuery(booking._id, { skip: !done });
  const [claim, { isLoading }] = useClaimRepairWarrantyMutation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!done || !data?.warrantyDays) return null;

  const until = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const c = data.claim;
  const claimOpen = c && ['submitted', 'under_review', 'approved'].includes(c.status);

  async function send() {
    if (text.trim().length < 10) { toast.error('Tell us what went wrong (a sentence is enough)'); return; }
    try { await claim({ id: booking._id, issueDescription: text.trim() }).unwrap(); toast.success('Claim sent. We will reply within a day'); setOpen(false); setText(''); }
    catch (err) { toast.error(errText(err, 'Could not send the claim. Try again.')); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}><ShieldCheck size={16} color={data.active ? success[600] : slate[400]} /><Text variant="bodySmall" weight="bold">{data.warrantyDays}-day warranty</Text></View>
      <Text variant="caption" color={ink[500]}>{data.active ? `Covered until ${until}.` : `Ended on ${until}.`}</Text>
      {c ? <View style={styles.claim}><Text variant="caption" weight="semibold" color={ink[700]}>{CLAIM_STATUS[c.status] || c.status}{c.reviewNote ? `: ${c.reviewNote}` : ''}</Text></View> : null}
      {data.active && !claimOpen && !open ? <Button label="Something is not right? Claim warranty" variant="ghost" size="small" onPress={() => setOpen(true)} /> : null}
      {open ? (
        <>
          <Input value={text} onChangeText={setText} maxLength={2000} multiline multilineHeight={80} placeholder="What went wrong since the repair? e.g. the screen stopped responding again" />
          <View style={styles.row}>
            <View style={styles.flex}><Button label="Cancel" variant="outline" onPress={() => setOpen(false)} fullWidth /></View>
            <View style={styles.flex}><Button label="Send claim" loading={isLoading} onPress={send} fullWidth /></View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  claim: { padding: spacing.sm, borderRadius: radius.medium, backgroundColor: slate[50] },
  flex: { flex: 1 },
});
