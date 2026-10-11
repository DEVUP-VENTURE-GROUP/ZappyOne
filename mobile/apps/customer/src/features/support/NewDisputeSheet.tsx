/** Raise a dispute (the website's NewDisputeForm): what went wrong, the order if known, and what happened. */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Scale } from 'lucide-react-native';
import { useOpenDisputeMutation } from '@zappy/core/api';
import { BottomSheet, Button, Input, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { ink } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { CategoryGrid } from './CategoryGrid';
import { DISPUTE_CATEGORIES } from './disputeMeta';

const EMPTY = { orderId: '', category: '', description: '' };

export function NewDisputeSheet({ visible, onClose, onCreated, presetOrderId = '' }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void; presetOrderId?: string }) {
  const t = useT();
  const [open, { isLoading }] = useOpenDisputeMutation();
  const [form, setForm] = useState(EMPTY);
  useEffect(() => { if (visible) setForm({ ...EMPTY, orderId: presetOrderId }); }, [visible, presetOrderId]);
  const set = (key: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    if (!form.category || !form.description.trim()) { toast.error(t('dispute.required', 'Category and description are required')); return; }
    if (form.description.trim().length < 10) { toast.error(t('ticket.tooShort', 'Description must be at least 10 characters')); return; }
    try {
      const res = await open({ category: form.category, description: form.description.trim(), ...(form.orderId.trim() && { orderId: form.orderId.trim() }) }).unwrap();
      toast.success(t('dispute.raised', 'Dispute raised. Our team will review it shortly'));
      onCreated(res.dispute._id);
    } catch (err) { toast.error(errText(err, t('dispute.failed', 'Could not raise the dispute. Try again.'))); }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('dispute.new', 'Raise a Dispute')} heightFraction={0.88}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="caption" weight="bold" color={ink[500]}>{t('dispute.category', 'Issue Category')} *</Text>
        <CategoryGrid options={DISPUTE_CATEGORIES} value={form.category} onChange={set('category')} keyPrefix="dispute.cat" />
        <Input label={t('ticket.orderId', 'Order ID (optional)')} value={form.orderId} onChangeText={set('orderId')} placeholder={t('dispute.orderHint', 'Paste order ID from your bookings')} autoCapitalize="none" />
        <Input label={`${t('dispute.describe', 'Describe the Issue')} *`} value={form.description} onChangeText={set('description')} maxLength={2000} multiline multilineHeight={96}
          placeholder={t('dispute.describeHint', 'Explain what happened in detail (min 10 characters)…')} helper={`${form.description.length} / 2000`} />
        <View style={styles.row}>
          <View style={styles.flex}><Button label={t('common.cancel', 'Cancel')} variant="outline" onPress={onClose} fullWidth /></View>
          <View style={styles.flex}><Button label={t('dispute.submit', 'Submit Dispute')} icon={<Scale size={16} color="#fff" />} loading={isLoading} onPress={submit} fullWidth /></View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
