/**
 * The technician's quote, itemised, with approve / decline / ask first (the
 * website's QuoteCard). No work proceeds on an unapproved quote, so this is a
 * hard gate, not a notification.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, FileText, MessageSquare, ShieldCheck, X } from 'lucide-react-native';
import { useRespondRepairQuoteMutation } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Input, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, colors, danger, ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Quote {
  _id: string; revision: number; status: string; diagnosisSummary?: string; replacesPaise?: number; replaceReason?: string; basePaise?: number;
  items?: { label: string; quantity?: number; amountPaise: number }[]; subtotalPaise: number; platformFeePaise?: number; discountPaise?: number;
  taxPaise?: number; totalPaise: number; warrantyDays?: number;
}

const DONE: Record<string, string> = { approve: 'Approved. Work can begin', reject: 'Quote rejected', clarify: 'Question sent to your technician' };

function Row({ k, v, tone = ink[500] }: { k: string; v: string; tone?: string }) {
  return <View style={styles.row}><Text variant="caption" color={tone}>{k}</Text><Text variant="caption" color={tone}>{v}</Text></View>;
}

export function QuoteCard({ quote, onDecided }: { quote: Quote; onDecided: () => void }) {
  const [respond, { isLoading }] = useRespondRepairQuoteMutation();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');

  async function decide(decision: 'approve' | 'reject' | 'clarify') {
    try {
      await respond({ quoteId: quote._id, decision, reason: note }).unwrap();
      toast.success(DONE[decision]);
      setAsking(false); setNote(''); onDecided();
    } catch (err) { toast.error(errText(err, 'Could not send your response. Try again.')); }
  }

  const extra = (quote.basePaise || 0) > 0;
  return (
    <View style={styles.card}>
      <View style={styles.head}><FileText size={16} color={accent[600]} /><Text variant="bodySmall" weight="bold" color={accent[700]}>Quote{quote.revision > 1 ? ` (revision ${quote.revision})` : ''}: your approval needed</Text></View>
      {quote.diagnosisSummary ? <Text variant="caption" color={ink[700]}>{quote.diagnosisSummary}</Text> : null}
      {quote.replacesPaise ? <View style={styles.white}><Text variant="caption" color={ink[700]}>This replaces the {formatPaise(quote.replacesPaise)} you booked at{quote.replaceReason ? `: ${quote.replaceReason}` : '.'}</Text></View> : null}
      <View style={styles.white}>
        {extra ? <View style={styles.row}><Text variant="bodySmall" color={ink[500]}>Booked repair (already agreed)</Text><Text variant="bodySmall" weight="semibold">{formatPaise(quote.basePaise)}</Text></View> : null}
        {(quote.items || []).map((item, i) => (
          <View key={i} style={styles.row}>
            <Text variant="bodySmall" numberOfLines={1} style={styles.flex}>{extra ? '+ ' : ''}{item.label}{(item.quantity || 1) > 1 ? ` × ${item.quantity}` : ''}</Text>
            <Text variant="bodySmall" weight="semibold">{formatPaise(item.amountPaise)}</Text>
          </View>
        ))}
        <View style={styles.sums}>
          <Row k="Subtotal" v={formatPaise(quote.subtotalPaise)} />
          {quote.platformFeePaise ? <Row k="Platform fee" v={formatPaise(quote.platformFeePaise)} /> : null}
          {quote.discountPaise ? <Row k="Discount" v={`− ${formatPaise(quote.discountPaise)}`} tone={success[700]} /> : null}
          {quote.taxPaise ? <Row k="Tax" v={formatPaise(quote.taxPaise)} /> : null}
          <View style={styles.row}><Text variant="body" weight="black">Total</Text><Text variant="body" weight="black">{formatPaise(quote.totalPaise)}</Text></View>
        </View>
      </View>
      {quote.warrantyDays ? <View style={styles.head}><ShieldCheck size={13} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>{quote.warrantyDays}-day warranty on this repair</Text></View> : null}
      {asking ? (
        <>
          <Input value={note} onChangeText={setNote} placeholder="What would you like to ask?" multiline multilineHeight={64} />
          <View style={styles.actions}>
            <View style={styles.flex}><Button label="Send question" loading={isLoading} disabled={!note.trim()} onPress={() => decide('clarify')} fullWidth /></View>
            <Button label="Back" variant="outline" onPress={() => setAsking(false)} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.actions}>
            <View style={styles.flex}><Button label="Approve" variant="success" icon={<Check size={15} color="#fff" />} loading={isLoading} onPress={() => decide('approve')} fullWidth /></View>
            <View style={styles.flex}><Button label="Decline" variant="outline" icon={<X size={15} color={danger[600]} />} disabled={isLoading} onPress={() => decide('reject')} fullWidth /></View>
          </View>
          <Button label="Ask a question first" variant="ghost" icon={<MessageSquare size={14} color={zappy[600]} />} onPress={() => setAsking(true)} fullWidth />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: accent[100], backgroundColor: accent[50] },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  white: { gap: 6, padding: spacing.md, borderRadius: radius.medium, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  sums: { gap: 4, marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
