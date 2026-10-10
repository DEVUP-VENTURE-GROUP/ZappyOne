/**
 * Messages between the provider and the customer on a job (the websites' JobChat),
 * with quick replies.
 */
import React, { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, CheckCheck, MessageCircle, Send, X } from 'lucide-react-native';
import { api, useJobChatQuery, useSendJobChatMutation } from '@zappy/core/api';
import { useSocketEvent } from '@zappy/core/hooks/useSocketEvent';
import { CHAT_QUICK } from '@zappy/core/shared/jobFlows';
import { useAppDispatch, useAppSelector } from '@zappy/core/store/hooks';
import { Text } from '..';
import { RIPPLE, errText } from '../../lib/feedback';
import { colors, zappy, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { toast } from '../Toast';

const clock = (at: string) => new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function JobChat({ jobId, title, onClose }: { jobId: string; title: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const role = useAppSelector((s) => s.auth.role);
  const { data, isLoading } = useJobChatQuery(jobId, { refetchOnMountOrArgChange: true, pollingInterval: 10000 });
  const [send, { isLoading: sending }] = useSendJobChatMutation();
  const [text, setText] = useState('');
  const list = useRef<FlatList>(null);

  useSocketEvent('chat.message', (p) => {
    if (p?.jobId === String(jobId)) dispatch(api.util.invalidateTags([{ type: 'JobChat', id: jobId }] as never));
  });

  async function submit(body?: string) {
    const t = String(body ?? text).trim();
    if (!t) return;
    try {
      await send({ id: jobId, text: t }).unwrap();
      if (body == null) setText('');
    } catch (err) { toast.error(errText(err, 'Message not sent. Try again.')); }
  }

  const messages: { id: string; text: string; mine: boolean; at: string; readAt?: string | null }[] = data?.messages || [];
  const quick = CHAT_QUICK[role === 'user' ? 'user' : 'provider'];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.chat, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.chatHead}>
          <View style={[styles.circle, { backgroundColor: zappy[50] }]}><MessageCircle size={17} color={zappy[700]} /></View>
          <View style={styles.flex}>
            <Text variant="body" weight="bold" numberOfLines={1}>{title}</Text>
            <Text variant="caption" color={ink[500]}>Messages stay with this booking</Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10} style={styles.iconBtn}><X size={18} color={ink[700]} /></Pressable>
        </View>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text variant="bodySmall" color={ink[500]} style={styles.center}>
            {isLoading ? 'Loading…' : data?.open === false ? data.reason : 'No messages yet. Say hello or use a quick reply.'}
          </Text>}
          renderItem={({ item: m }) => (
            <View style={[styles.bubbleRow, m.mine ? styles.end : styles.start]}>
              <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
                <Text variant="body" color={m.mine ? '#fff' : ink[900]}>{m.text}</Text>
                <View style={styles.meta}>
                  <Text variant="caption" color={m.mine ? 'rgba(255,255,255,0.75)' : ink[400]}>{clock(m.at)}</Text>
                  {m.mine ? (m.readAt ? <CheckCheck size={13} color="rgba(255,255,255,0.75)" /> : <Check size={13} color="rgba(255,255,255,0.75)" />) : null}
                </View>
              </View>
            </View>
          )}
        />
        {data?.open === false ? (
          <Text variant="bodySmall" color={ink[500]} style={[styles.center, styles.closed]}>{data.reason}</Text>
        ) : (
          <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
              {quick.map((q: string) => (
                <Pressable key={q} onPress={() => submit(q)} disabled={sending} android_ripple={RIPPLE} style={styles.quickChip}>
                  <Text variant="bodySmall" weight="medium" color={ink[700]}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.inputRow}>
              <TextInput value={text} onChangeText={setText} maxLength={1000} placeholder="Type a message" placeholderTextColor={ink[400]}
                multiline style={styles.chatInput} accessibilityLabel="Message" />
              <Pressable onPress={() => submit()} disabled={sending || !text.trim()} accessibilityRole="button" accessibilityLabel="Send"
                style={[styles.sendBtn, (sending || !text.trim()) && styles.dim]}><Send size={17} color="#fff" /></Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center', paddingVertical: spacing.xxl },
  dim: { opacity: 0.5 },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  chat: { flex: 1, backgroundColor: colors.background },
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  chatList: { padding: spacing.base, gap: spacing.sm, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row' },
  start: { justifyContent: 'flex-start' },
  end: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.medium, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  mine: { backgroundColor: zappy[600], borderBottomRightRadius: radius.small },
  theirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: radius.small },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  closed: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.md },
  composer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm },
  quick: { gap: spacing.sm, paddingHorizontal: spacing.md },
  quickChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 34, justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900] },
  sendBtn: { width: 44, height: 44, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
