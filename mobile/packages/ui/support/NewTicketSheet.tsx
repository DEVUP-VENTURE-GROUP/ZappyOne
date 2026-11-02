/** Start a conversation with ZappyOne (the website's NewTicketForm): a topic, a subject, the details, and how urgent it is. */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Send } from 'lucide-react-native';
import { useCreateTicketMutation } from '@zappy/core/api';
import { BottomSheet, Button, Chip, Input, Text } from '../components';
import { toast } from '../components/Toast';
import { errText } from '../lib/feedback';
import { useT } from '../lib/i18n';
import { ink } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { CategoryGrid } from './CategoryGrid';
import { CATEGORIES, PRIORITY_SLA, type Audience } from './ticketMeta';

const EMPTY = { category: '', subject: '', description: '', priority: 'normal' };

export function NewTicketSheet({ visible, audience, onClose, onCreated }: { visible: boolean; audience: Audience; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT();
  const [create, { isLoading }] = useCreateTicketMutation();
  const [form, setForm] = useState(EMPTY);
  useEffect(() => { if (visible) setForm(EMPTY); }, [visible]);
  const set = (key: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const idea = form.category === 'feature_request';

  async function submit() {
    if (!form.category || !form.subject.trim() || !form.description.trim()) { toast.error(t('ticket.required', 'Pick a topic, and add a subject and the details')); return; }
    if (form.description.trim().length < 10) { toast.error(t('ticket.tooShort', 'Details must be at least 10 characters')); return; }
    try {
      const res = await create({ category: form.category, subject: form.subject.trim(), description: form.description.trim(), priority: form.priority }).unwrap();
      toast.success(t('ticket.created', "Sent. We'll reply here and send you a notification."));
      onCreated(res.ticket._id);
    } catch (err) { toast.error(errText(err, t('ticket.createFailed', 'Could not send. Try again.'))); }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('ticket.new', 'Talk to ZappyOne')} heightFraction={0.88}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="caption" weight="bold" color={ink[500]}>{t('ticket.category', 'What is it about?')} *</Text>
        <CategoryGrid options={CATEGORIES[audience]} value={form.category} onChange={set('category')} keyPrefix="ticket.cat" />
        <Input label={`${t('ticket.subject', 'Subject')} *`} value={form.subject} onChangeText={set('subject')} maxLength={200}
          placeholder={idea ? t('ticket.ideaHint', 'The feature in a few words') : t('ticket.subjectHint', 'A short summary')} />
        <Input label={`${t('ticket.description', 'Details')} *`} value={form.description} onChangeText={set('description')} multiline multilineHeight={96}
          placeholder={idea ? t('ticket.ideaDetail', 'What should it do, and how would it help you?') : t('ticket.descriptionHint', 'Tell us what happened, so we can fix it')} />
        <Text variant="caption" weight="bold" color={ink[500]}>{t('ticket.priority', 'Priority')}</Text>
        <View style={styles.row}>{['low', 'normal', 'high', 'urgent'].map((p) => <Chip key={p} label={t(`ticket.pr.${p}`, p[0].toUpperCase() + p.slice(1))} selected={form.priority === p} onPress={() => set('priority')(p)} />)}</View>
        <Text variant="caption" color={ink[400]}>{t('ticket.expected', 'Expected reply')}: {PRIORITY_SLA[form.priority] || 4}h</Text>
        <View style={styles.row}>
          <View style={styles.flex}><Button label={t('common.cancel', 'Cancel')} variant="outline" onPress={onClose} fullWidth /></View>
          <View style={styles.flex}><Button label={t('ticket.submit', 'Send to ZappyOne')} icon={<Send size={16} color="#fff" />} loading={isLoading} onPress={submit} fullWidth /></View>
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
