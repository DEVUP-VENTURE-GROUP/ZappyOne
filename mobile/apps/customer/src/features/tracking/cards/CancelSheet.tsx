/**
 * Cancel, with what it costs said first (the website's cancel sheet): the
 * server's quote for this moment (fee, inspection already done, what comes
 * back), a reason when it asks for one, or "this one needs us" when it can no
 * longer be cancelled from here.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BottomSheet, Button, Chip, Skeleton, Text } from '@zappy/ui/components';
import { ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

export interface CancelQuote { allowed?: boolean; message?: string; feePaise?: number; earnedPaise?: number; paidPaise?: number; refundPaise?: number }

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <View style={styles.line}><Text variant="caption" weight={strong ? 'bold' : 'regular'} color={strong ? ink[900] : ink[500]}>{k}</Text><Text variant="caption" weight={strong ? 'bold' : 'semibold'}>{v}</Text></View>;
}

export function CancelSheet({ visible, onClose, quote, loading, quoteNeeded, reasons, note, onCancel }: {
  visible: boolean; onClose: () => void; quote?: CancelQuote; loading: boolean; quoteNeeded: boolean; reasons: string[]; note?: string; onCancel: (reason: string) => Promise<void>;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setReason(''); }, [visible]);
  const blocked = quote?.allowed === false;
  const costs = !blocked && ((quote?.feePaise || 0) > 0 || (quote?.earnedPaise || 0) > 0);

  async function go() {
    setBusy(true);
    try { await onCancel(reason || 'Cancelled by customer'); onClose(); } finally { setBusy(false); }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={blocked ? 'This one needs us' : 'Cancel this booking?'}>
      <View style={styles.body}>
        {loading && !quote ? <View style={{ gap: 8 }}><Skeleton height={14} width="80%" /><Skeleton height={14} width="60%" /><Skeleton height={40} /></View> : (
          <>
            <Text variant="bodySmall" color={ink[700]}>{quote?.message || note || 'You can cancel this booking.'}</Text>
            {costs ? (
              <View style={styles.costs}>
                {quote?.earnedPaise ? <Line k="Inspection already done" v={rupees(quote.earnedPaise)} /> : null}
                {quote?.feePaise ? <Line k="Cancellation fee" v={rupees(quote.feePaise)} /> : null}
                {quote?.paidPaise ? <Line k="Back to you" v={rupees(quote.refundPaise || 0)} strong /> : null}
                <Text variant="caption" color={ink[400]}>Cancellation fees go to the providers whose time was lost.</Text>
              </View>
            ) : null}
            {!blocked && reasons.length ? (
              <View style={styles.reasons}>
                <Text variant="caption" weight="semibold" color={ink[700]}>Why are you cancelling?</Text>
                <View style={styles.chips}>{reasons.map((r) => <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />)}</View>
              </View>
            ) : null}
          </>
        )}
        <View style={styles.actions}>
          <View style={styles.flex}><Button label={blocked ? 'Close' : 'Keep booking'} variant="outline" onPress={onClose} fullWidth /></View>
          <View style={styles.flex}>
            {blocked ? <Button label="Get help" variant="secondary" onPress={() => { onClose(); router.push('/support' as never); }} fullWidth />
              : <Button label="Cancel booking" variant="danger" loading={busy} disabled={(quoteNeeded && (!quote || loading)) || (reasons.length > 0 && !reason)} onPress={go} fullWidth />}
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.base },
  costs: { gap: 6, padding: spacing.md, borderRadius: radius.large, backgroundColor: slate[50] },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  reasons: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex: { flex: 1 },
});
