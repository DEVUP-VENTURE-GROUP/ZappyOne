/**
 * Open a support ticket (the website's NewTicketForm): a category, a subject,
 * what happened, an optional order, and how urgent it is, with the reply time
 * that priority promises.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Send } from 'lucide-react-native';
import { useCreateTicketMutation } from '@zappy/core/api';
import { BottomSheet, Button, Chip, Input, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { ink } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { CategoryGrid } from './CategoryGrid';
import { CATEGORIES, PRIORITY_SLA } from './ticketMeta';

const EMPTY = { category: '', subject: '', description: '', orderId: '', priority: 'normal' };

export function NewTicketSheet({ visible, onClose, onCreated, presetOrderId = '' }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void; presetOrderId?: string }) {
  const t = useT();
  const [create, { isLoading }] = useCreateTicketMutation();
  const [form, setForm] = useState(EMPTY);
  useEffect(() => { if (visible) setForm({ ...EMPTY, orderId: presetOrderId }); }, [visible, presetOrderId]);
  const set = (key: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    if (!form.category || !form.subject.trim() || !form.description.trim()) { toast.error(t('ticket.required', 'Category, subject and description are required')); return; }
    if (form.description.trim().length < 10) { toast.error(t('ticket.tooShort', 'Description must be at least 10 characters')); return; }
    try {
      const res = await create({ category: form.category, subject: form.subject.trim(), description: form.description.trim(), priority: form.priority, ...(form.orderId.trim() && { orderId: form.orderId.trim() }) }).unwrap();
      toast.success(t('ticket.created', "Ticket created. We'll reply shortly"));
      onCreated(res.ticket._id);
    } catch (err) { toast.error(errText(err, t('ticket.createFailed', 'Could not create the ticket. Try again.'))); }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('ticket.new', 'New Support Ticket')} heightFraction={0.88}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="caption" weight="bold" color={ink[500]}>{t('ticket.category', 'Category')} *</Text>
        <CategoryGrid options={CATEGORIES} value={form.category} onChange={set('category')} keyPrefix="ticket.cat" />
        <Input label={`${t('ticket.subject', 'Subject')} *`} value={form.subject} onChangeText={set('subject')} maxLength={200} placeholder={t('ticket.subjectHint', 'Brief summary of your issue')} />
        <Input label={`${t('ticket.description', 'Description')} *`} value={form.description} onChangeText={set('description')} multiline multilineHeight={96} placeholder={t('ticket.descriptionHint', 'Explain the issue in detail…')} />
        <Input label={t('ticket.orderId', 'Order ID (optional)')} value={form.orderId} onChangeText={set('orderId')} placeholder={t('ticket.orderIdHint', 'Related order ID')} autoCapitalize="none" />
        <Text variant="caption" weight="bold" color={ink[500]}>{t('ticket.priority', 'Priority')}</Text>
        <View style={styles.row}>{['low', 'normal', 'high', 'urgent'].map((p) => <Chip key={p} label={t(`ticket.pr.${p}`, p[0].toUpperCase() + p.slice(1))} selected={form.priority === p} onPress={() => set('priority')(p)} />)}</View>
        <Text variant="caption" color={ink[400]}>{t('ticket.expected', 'Expected reply')}: {PRIORITY_SLA[form.priority] || 4}h</Text>
        <View style={styles.row}>
          <View style={styles.flex}><Button label={t('common.cancel', 'Cancel')} variant="outline" onPress={onClose} fullWidth /></View>
          <View style={styles.flex}><Button label={t('ticket.submit', 'Submit Ticket')} icon={<Send size={16} color="#fff" />} loading={isLoading} onPress={submit} fullWidth /></View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
});
