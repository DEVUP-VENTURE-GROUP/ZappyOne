/**
 * One support ticket's conversation (the website's TicketThread): when a reply
 * is due (or that it is overdue and escalated), the messages, the resolution,
 * and a reply box while it is open.
 */
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, Clock } from 'lucide-react-native';
import { useAddTicketMessageMutation, useGetTicketQuery } from '@zappy/core/api';
import { LoadingState, ScreenHeader, Text } from '../components';
import { toast } from '../components/Toast';
import { useT } from '../lib/i18n';
import { colors, danger, ink, slate, success } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { MessageThread } from './MessageThread';
import { StatusBadge } from './StatusBadge';
import { CLOSED } from './ticketMeta';

export function TicketThreadPage({ base = '/support' }: { base?: string }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading, refetch } = useGetTicketQuery(id, { pollingInterval: 8000 }); // checked often while open, so replies arrive like a chat
  const [send, { isLoading: sending }] = useAddTicketMessageMutation();
  const ticket = data?.ticket;
  const back = () => (router.canGoBack() ? router.back() : router.replace(base as never));

  async function reply(text: string) {
    try { await send({ id, text }).unwrap(); refetch(); return true; }
    catch { toast.error(t('ticket.sendFailed', 'Could not send the message. Try again.')); return false; }
  }

  if (isLoading || !ticket) return <LoadingState />;
  const open = !CLOSED.includes(ticket.status);
  const due = new Date(ticket.slaDeadline).getTime();
  const overdue = open && due < Date.now();
  const hoursLeft = Math.max(0, Math.round((due - Date.now()) / 3600000));

  return (
    <KeyboardAvoidingView style={[styles.page, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={ticket.subject} subtitle={`#${String(id).slice(-8)}`} onBack={back} right={<StatusBadge status={ticket.status} />} />
      {open ? (
        <View style={[styles.sla, overdue && styles.slaLate]}>
          <Clock size={11} color={overdue ? danger[600] : ink[500]} />
          <Text variant="caption" weight="semibold" color={overdue ? danger[600] : ink[500]}>{overdue ? t('ticket.overdue', 'Response overdue. Escalated to our senior team') : `${t('ticket.replyWithin', 'Expected reply within')} ${hoursLeft}h`}</Text>
        </View>
      ) : null}
      <MessageThread messages={ticket.messages || []} teamLabel="ZappyOne" open={open} sending={sending} placeholder={t('ticket.replyHint', 'Write to ZappyOne…')} onSend={reply}
        footer={ticket.status === 'resolved' ? (
          <View style={styles.resolved}>
            <CheckCircle2 size={16} color={success[600]} />
            <View style={styles.flex}>
              <Text variant="caption" weight="bold" color={success[700]}>{t('ticket.resolved', 'Sorted')}</Text>
              <Text variant="caption" color={success[600]}>{ticket.resolutionNote || t('ticket.resolvedNote', 'ZappyOne marked this done. Start a new message if you need anything else.')}</Text>
            </View>
          </View>
        ) : null} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  sla: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.base, marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.medium, backgroundColor: slate[50] },
  slaLate: { backgroundColor: danger[50] },
  resolved: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.medium, backgroundColor: success[50] },
  flex: { flex: 1 },
});
