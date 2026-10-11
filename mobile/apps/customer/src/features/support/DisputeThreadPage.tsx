/** One dispute (the website's DisputeThread): the complaint with its attachments, the conversation, the resolution and any refund. */
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2 } from 'lucide-react-native';
import { useAddDisputeMessageMutation, useGetDisputeQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { webAsset } from '@zappy/ui/lib/media';
import { useT } from '@zappy/ui/lib/i18n';
import { openLink } from '@zappy/ui/lib/openLink';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { DISPUTE_STATUS } from './disputeMeta';
import { MessageThread } from './MessageThread';
import { StatusBadge } from './StatusBadge';

export function DisputeThreadPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading, refetch } = useGetDisputeQuery(id, { pollingInterval: 30000 });
  const [send, { isLoading: sending }] = useAddDisputeMessageMutation();
  const d = data?.dispute;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/disputes' as never));

  async function reply(text: string) {
    try { await send({ id, text }).unwrap(); refetch(); return true; }
    catch { toast.error(t('ticket.sendFailed', 'Could not send the message. Try again.')); return false; }
  }

  if (isLoading || !d) return <LoadingState />;
  const r = d.resolution;
  return (
    <KeyboardAvoidingView style={[styles.page, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={d.category?.replace(/_/g, ' ')} subtitle={`#${String(id).slice(-8)}`} onBack={back} right={<StatusBadge status={d.status} meta={DISPUTE_STATUS} />} />
      <MessageThread messages={d.messages || []} teamLabel="Support Team" open={!['resolved', 'closed'].includes(d.status)} sending={sending} placeholder={t('dispute.more', 'Add more details…')} onSend={reply}
        header={(
          <View style={styles.complaint}>
            <Text variant="caption" weight="bold" color={ink[500]}>{t('dispute.yours', 'YOUR COMPLAINT')}</Text>
            <Text variant="bodySmall" color={ink[700]}>{d.description}</Text>
            {d.evidenceUrls?.length ? (
              <View style={styles.files}>
                {(d.evidenceUrls as string[]).map((url, i) => (
                  <Pressable key={url} onPress={() => openLink(webAsset(url) || url)} accessibilityRole="link" style={styles.file}><Text variant="caption" weight="semibold" color={zappy[600]}>{t('dispute.attachment', 'Attachment')} {i + 1}</Text></Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}
        footer={r ? (
          <View style={styles.resolution}>
            <View style={styles.inline}><CheckCircle2 size={14} color={success[600]} /><Text variant="caption" weight="bold" color={success[700]}>{t('dispute.resolution', 'RESOLUTION')}</Text></View>
            <Text variant="bodySmall" color={success[700]} style={styles.cap}>{r.type?.replace(/_/g, ' ')}</Text>
            {r.adminNotes ? <Text variant="caption" color={success[700]}>{r.adminNotes}</Text> : null}
            {r.refundAmountPaise > 0 ? <Text variant="bodySmall" weight="bold" color={success[700]}>{t('dispute.refund', 'Refund')}: {formatPaise(r.refundAmountPaise)}</Text> : null}
          </View>
        ) : null} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  complaint: { gap: 4, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: slate[50] },
  files: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  file: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.small, backgroundColor: zappy[50] },
  resolution: { gap: 4, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.medium, backgroundColor: success[50] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cap: { textTransform: 'capitalize' },
});
