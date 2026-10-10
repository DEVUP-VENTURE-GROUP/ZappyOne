/**
 * Contest a rating, penalty or decision (the websites' WorkerAppealsPage):
 * file an appeal and follow each one to a decision.
 */
import React, { useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, Plus, Scale, X, MessagesSquare } from 'lucide-react-native';
import { useGetWorkerAppealsQuery, useCreateWorkerAppealMutation } from '@zappy/core/api';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { errText } from '../../lib/feedback';
import { colors, zappy, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const APPEAL_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Pending review', bg: accent[50], fg: accent[700] },
  under_review: { label: 'Under review', bg: zappy[50], fg: zappy[700] },
  upheld: { label: 'Upheld (won)', bg: success[50], fg: success[700] },
  dismissed: { label: 'Dismissed', bg: danger[50], fg: danger[600] },
};

const TYPE_OPTS = ['rating', 'penalty', 'cancellation', 'pause', 'dues', 'verification', 'order_issue'];

const TYPE_LABELS: Record<string, string> = {
  rating: 'A rating or review', penalty: 'A penalty or fine', cancellation: 'A cancellation', pause: 'Being taken offline',
  dues: 'My dues or payments', verification: 'My verification', order_issue: 'Something about a job',
};

function NewAppealSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ type: 'rating', subject: '', description: '', jobRef: '' });
  const [create, { isLoading }] = useCreateWorkerAppealMutation();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  async function submit() {
    if (!form.subject.trim()) { toast.error('Add a subject'); return; }
    if (form.description.length < 30) { toast.error('Please describe the issue in at least 30 characters'); return; }
    try { await create(form).unwrap(); toast.success('Appeal submitted'); onClose(); }
    catch (err) { toast.error(errText(err, 'Failed to submit appeal. Please try again.')); }
  }
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={[styles.between, styles.sheetHead]}>
          <Text variant="heading3" weight="black">File an appeal</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><X size={20} color={ink[700]} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <Text variant="caption" weight="black" color={ink[400]}>WHAT IS THIS ABOUT?</Text>
          <View style={styles.wrap}>
            {TYPE_OPTS.map((t) => (
              <Pressable key={t} onPress={() => set('type', t)} accessibilityRole="radio" accessibilityState={{ selected: form.type === t }} style={[styles.choice, form.type === t && styles.choiceOn]}>
                <Text variant="caption" weight="bold" color={form.type === t ? zappy[700] : ink[700]}>{TYPE_LABELS[t]}</Text>
              </Pressable>
            ))}
          </View>
          <Text variant="caption" weight="black" color={ink[400]}>SUBJECT</Text>
          <TextInput value={form.subject} onChangeText={(v) => set('subject', v)} placeholder="e.g. Unfair 1-star rating from customer" placeholderTextColor={ink[400]} style={styles.input} />
          <Text variant="caption" weight="black" color={ink[400]}>BOOKING REFERENCE (OPTIONAL)</Text>
          <TextInput value={form.jobRef} onChangeText={(v) => set('jobRef', v.toUpperCase())} maxLength={40} autoCapitalize="characters" placeholder="e.g. ZR5ZRJXCRP, on the job screen" placeholderTextColor={ink[400]} style={styles.input} />
          <View style={styles.between}>
            <Text variant="caption" weight="black" color={ink[400]}>WHAT HAPPENED</Text>
            <Text variant="caption" weight="bold" color={form.description.length < 30 ? accent[600] : success[600]}>{form.description.length}/30 min</Text>
          </View>
          <TextInput value={form.description} onChangeText={(v) => set('description', v)} multiline placeholder="Describe exactly what happened and why you are appealing. Details help us review faster."
            placeholderTextColor={ink[400]} style={[styles.area, { minHeight: 120 }]} />
          <View style={[styles.info, styles.row]}><Clock size={16} color={zappy[500]} /><Text variant="caption" color={zappy[800]} style={styles.flex}>Our support team reviews appeals within 2-3 business days. We will notify you once a decision is made.</Text></View>
          <Button label="Submit appeal" onPress={submit} loading={isLoading} disabled={form.description.length < 30} fullWidth size="large" />
        </ScrollView>
      </View>
    </Modal>
  );
}

type Appeal = { _id: string; type: string; status: string; subject: string; description: string; adminNote?: string; createdAt: string; jobRef?: string; orderId?: string };

export function WorkerAppealsPage() {
  const { data, isLoading, refetch } = useGetWorkerAppealsQuery();
  const [showNew, setShowNew] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const appeals: Appeal[] = data?.appeals ?? [];
  return (
    <View style={styles.page}>
      <ScreenHeader title="Appeals" safeArea right={<Button label="File appeal" size="small" icon={<Plus size={14} color="#fff" />} onPress={() => setShowNew(true)} />} />
      {isLoading ? <LoadingState /> : (
        <FlatList
          data={appeals}
          keyExtractor={(a) => a._id}
          contentContainerStyle={styles.body}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
          ListHeaderComponent={
            <View style={[styles.card, styles.row, { marginBottom: spacing.md }]}>
              <Scale size={22} color={zappy[600]} />
              <Text variant="caption" color={ink[700]} style={styles.flex}>Contest a rating, penalty or decision you think was unfair. A person reviews every case.</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState title="No appeals yet" message="If you feel a rating or penalty was unfair, you can file an appeal here." actionLabel="File an appeal" onAction={() => setShowNew(true)} />}
          renderItem={({ item: a }) => {
            const s = APPEAL_STATUS[a.status] ?? APPEAL_STATUS.pending;
            return (
              <View style={styles.card}>
                <View style={styles.wrap}>
                  <View style={styles.tag}><Text variant="caption" weight="bold" color={ink[700]}>{TYPE_LABELS[a.type] ?? a.type}</Text></View>
                  <View style={[styles.tag, { backgroundColor: s.bg }]}><Text variant="caption" weight="bold" color={s.fg}>{s.label}</Text></View>
                </View>
                <Text variant="body" weight="black">{a.subject}</Text>
                <Text variant="bodySmall" color={ink[500]} numberOfLines={3}>{a.description}</Text>
                {a.adminNote ? (
                  <View style={[styles.info, styles.row]}><MessagesSquare size={16} color={zappy[400]} />
                    <View style={styles.flex}><Text variant="caption" weight="bold">ADMIN RESPONSE</Text><Text variant="bodySmall">{a.adminNote}</Text></View>
                  </View>
                ) : null}
                <View style={styles.between}>
                  <Text variant="caption" color={ink[400]}>Submitted {new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  {a.jobRef || a.orderId ? <Text variant="caption" color={ink[400]}>{a.jobRef || `ID: ${a.orderId?.slice(-6)}`}</Text> : null}
                </View>
              </View>
            );
          }}
        />
      )}
      {showNew ? <NewAppealSheet onClose={() => { setShowNew(false); refetch(); }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  info: { backgroundColor: zappy[50], borderRadius: radius.medium, padding: spacing.md },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: slate[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  area: { minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], textAlignVertical: 'top', backgroundColor: colors.surface },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  sheetHead: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 40, justifyContent: 'center', backgroundColor: colors.surface },
  choiceOn: { borderColor: zappy[600], backgroundColor: zappy[50] },
});
