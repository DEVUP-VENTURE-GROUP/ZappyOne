/**
 * Buying the customer's list: mark each item bought, unavailable or swapped,
 * with the bill photo (the website's ShoppingExecution and ItemRow).
 */
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Banknote, Check, X } from 'lucide-react-native';
import {
  useUpdateHelpingItemMutation,
  useProposeHelpingAlternativeMutation,
  useRecordHelpingAdvanceMutation,
} from '@zappy/core/api';
import { helpingItemDone } from '@zappy/core/shared/jobFlows';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { ImageUploadField } from '../../../components/common/ImageUploadField';
import { JobCard, Eyebrow } from '../../../components/jobs/JobCard';
import { type ApiErr, errText } from '../../../lib/feedback';
import { colors, zappy, ink, accent } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import type { Item, Task } from './types';

function ItemRow({ item, disabled, onPurchase, onUnavailable, onAlternative }: {
  item: Item; disabled: boolean; onPurchase: (price: number) => void; onUnavailable: (status: string) => void;
  onAlternative: (alt: { name: string; pricePaise: number; quantity: number; photoKey: string; note: string }) => void;
}) {
  const [price, setPrice] = useState('');
  const [showAlt, setShowAlt] = useState(false);
  const [alt, setAlt] = useState({ name: '', price: '', photoKey: '' });
  const done = helpingItemDone(item);
  return (
    <JobCard>
      <View style={styles.between}>
        <View style={styles.flex}>
          <Text variant="body" weight="bold">{item.name} × {item.quantity}</Text>
          {item.preferredBrand || item.preferredVariant ? <Text variant="caption" color={ink[400]}>{[item.preferredBrand, item.preferredVariant].filter(Boolean).join(', ')}</Text> : null}
          <Text variant="caption" color={ink[500]}>Max: {formatPaise(item.maxApprovedPricePaise)}</Text>
        </View>
        <Text variant="caption" weight="bold" color={zappy[500]}>{item.status.replace(/_/g, ' ').toUpperCase()}</Text>
      </View>
      {!done && !disabled ? (
        <>
          <View style={styles.row}>
            <TextInput value={price} onChangeText={(v) => setPrice(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="Price paid (₹)" placeholderTextColor={ink[400]} style={[styles.input, styles.flex]} />
            <Button label="Bought" variant="success" icon={<Check size={14} color="#fff" />} onPress={() => price && onPurchase(Number(price))} />
          </View>
          <View style={styles.row}>
            <Button label="Not found" variant="outline" icon={<X size={13} color={ink[900]} />} onPress={() => onUnavailable('not_found')} style={styles.flex} />
            <Button label="Propose alternative" variant="outline" onPress={() => setShowAlt((v) => !v)} style={styles.flex} />
          </View>
        </>
      ) : null}
      {showAlt && !done ? (
        <View style={styles.alt}>
          <TextInput value={alt.name} onChangeText={(v) => setAlt((a) => ({ ...a, name: v }))} placeholder="Alternative product name" placeholderTextColor={ink[400]} style={styles.input} />
          <TextInput value={alt.price} onChangeText={(v) => setAlt((a) => ({ ...a, price: v.replace(/[^\d.]/g, '') }))} keyboardType="decimal-pad" placeholder="Its price (₹)" placeholderTextColor={ink[400]} style={styles.input} />
          <ImageUploadField value={alt.photoKey} onChange={(k) => setAlt((a) => ({ ...a, photoKey: k }))} folder="helping/alternatives" label="photo of the item" />
          <Button label="Send to customer for approval" disabled={!alt.name || !alt.price}
            onPress={() => { onAlternative({ name: alt.name, pricePaise: Math.round(Number(alt.price || 0) * 100), quantity: item.quantity, photoKey: alt.photoKey, note: '' }); setShowAlt(false); }} fullWidth />
        </View>
      ) : null}
    </JobCard>
  );
}

export function ShoppingExecution({ task, onChanged, disabled }: { task: Task; onChanged: () => void; disabled: boolean }) {
  const [updateItem] = useUpdateHelpingItemMutation();
  const [proposeAlt] = useProposeHelpingAlternativeMutation();
  const [recordAdvance] = useRecordHelpingAdvanceMutation();
  const [advanceAmount, setAdvanceAmount] = useState('');
  if (!(task.items || []).length) return null;

  async function markPurchased(item: Item, price: number) {
    try {
      await updateItem({ id: task._id, itemId: item._id, status: 'purchased', actualPricePaise: Math.round(price * 100) }).unwrap();
      toast.success('Marked purchased'); onChanged();
    } catch (err) {
      if ((err as ApiErr)?.data?.code === 'APPROVAL_REQUIRED') toast.error('That price is above what the customer approved — propose it as an alternative instead');
      else toast.error(errText(err, 'Could not save this'));
    }
  }
  async function markUnavailable(item: Item, status: string) {
    try { await updateItem({ id: task._id, itemId: item._id, status, reason: 'Not available in store' }).unwrap(); onChanged(); }
    catch (err) { toast.error(errText(err, 'Could not save this')); }
  }
  async function sendAdvance() {
    if (!advanceAmount) return;
    try {
      await recordAdvance({ id: task._id, amountPaise: Math.round(Number(advanceAmount) * 100) }).unwrap();
      toast.success('Advance recorded — you will be reimbursed on settlement'); setAdvanceAmount(''); onChanged();
    } catch (err) { toast.error(errText(err, 'That is more than the advance limit — the customer must fund it')); }
  }

  return (
    <View style={styles.gap}>
      {(task.items || []).map((item) => (
        <ItemRow key={item._id} item={item} disabled={disabled}
          onPurchase={(p) => markPurchased(item, p)} onUnavailable={(s) => markUnavailable(item, s)}
          onAlternative={(alt) => proposeAlt({ id: task._id, itemId: item._id, ...alt }).unwrap()
            .then(() => { toast.success('Sent for approval'); onChanged(); })
            .catch((err: unknown) => toast.error(errText(err, 'Could not send this')))} />
      ))}
      {task.itemMoney?.paymentModel === 'worker_advance' ? (
        <JobCard>
          <View style={styles.row}><Banknote size={13} color={ink[500]} /><Eyebrow>YOU'RE FRONTING THIS PURCHASE</Eyebrow></View>
          <View style={styles.row}>
            <TextInput value={advanceAmount} onChangeText={(v) => setAdvanceAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="Amount paid at till (₹)" placeholderTextColor={ink[400]} style={[styles.input, styles.flex]} />
            <Button label="Record" onPress={sendAdvance} />
          </View>
          <Text variant="caption" color={ink[400]}>You'll be reimbursed exactly this amount when the task settles.</Text>
        </JobCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  gap: { gap: spacing.md },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  alt: { backgroundColor: accent[50], borderRadius: radius.button, padding: spacing.md, gap: spacing.sm },
});
