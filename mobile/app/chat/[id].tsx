/**
 * Order chat.
 * ----------------------------------------------------------------------------
 * Shared between the customer and worker apps — an order's chat has exactly
 * two participants, one of each kind, and this screen renders for whichever
 * one is viewing it.
 *
 * Sending goes over HTTP (`POST /orders/:id/chat`), not the socket: the
 * canonical event contract (services/socket/events.ts) has no client→server
 * `chat.send` event. The server broadcasts the resulting `chat.message` to the
 * order room, which is what live-updates the other party.
 *
 * The composer sits above the keyboard via `KeyboardAvoidingView`, and the
 * bottom inset is applied to the composer rather than the screen so the input
 * rests on the gesture bar instead of floating above a white gap.
 * ----------------------------------------------------------------------------
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Send } from 'lucide-react-native';
import {
  EmptyState,
  ErrorState,
  IconButton,
  ScreenHeader,
  SkeletonList,
  Text,
} from '../../components/ui';
import { useSocket } from '../../hooks/useSocket';
import {
  useGetChatMessagesQuery,
  useSendChatMessageMutation,
} from '../../services/api/ordersApi';
import { useGetWorkerMeQuery } from '../../services/api/workerApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { fontFamily } from '../../theme/typography';
import { screenPadding, spacing } from '../../theme/spacing';
import type { RootState } from '../../store';
import type { ChatMessage } from '../../types/api';

export default function ChatScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [text, setText] = useState('');
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const socketClient = useSocket(orderId);
  const role = useSelector((state: RootState) => state.auth.role);
  const user = useSelector((state: RootState) => state.auth.user);
  const { data: workerMe } = useGetWorkerMeQuery(undefined, { skip: role !== 'worker' });
  const myKind: 'user' | 'worker' = role === 'worker' ? 'worker' : 'user';
  const myId = role === 'worker' ? workerMe?._id : user?._id;

  const {
    data: history = [],
    isLoading,
    error,
    refetch,
  } = useGetChatMessagesQuery({ orderId: String(orderId) });
  const [sendChatMessage, { isLoading: sending }] = useSendChatMessageMutation();

  useEffect(() => {
    const handler = (msg: ChatMessage) => setLiveMessages((prev) => [...prev, msg]);
    socketClient.on('chat.message', handler);
    return () => socketClient.off('chat.message', handler);
  }, [socketClient]);

  // De-dupe: a message we sent may arrive both in the mutation response's
  // cache invalidation AND as a live socket echo.
  const messages = useMemo(
    () =>
      [...history, ...liveMessages].filter(
        (m, i, arr) => arr.findIndex((x) => x._id === m._id) === i,
      ),
    [history, liveMessages],
  );

  const handleSend = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      await sendChatMessage({ orderId: String(orderId), text: body }).unwrap();
    } catch {
      setText(body); // restore so the user doesn't lose what they typed
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.from?.kind === myKind && item.from.id === myId;
    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text
          variant="bodySmall"
          color={isMe ? colors.textInverse : colors.textPrimary}
        >
          {item.text}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Order chat" onBack={() => router.back()} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        {isLoading ? (
          <View style={styles.padded}>
            <SkeletonList count={4} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <ErrorState
              message={getApiErrorMessage(error, "We couldn't load this conversation.")}
              onRetry={refetch}
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item._id}
            renderItem={renderMessage}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <EmptyState
                title="No messages yet"
                message="Say hello — your pro will see it right away."
              />
            }
          />
        )}

        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.md }]}>
          <TextInput
            style={styles.input}
            placeholder="Type a message…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline
            maxLength={1000}
            accessibilityLabel="Message"
          />
          <IconButton
            icon={<Send size={18} color={colors.textInverse} />}
            variant="primary"
            onPress={handleSend}
            disabled={sending || !text.trim()}
            accessibilityLabel="Send message"
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  padded: { paddingHorizontal: screenPadding, paddingTop: spacing.base },
  centered: { flex: 1, justifyContent: 'center', paddingHorizontal: screenPadding },
  list: { padding: screenPadding, gap: spacing.sm, flexGrow: 1 },

  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.large,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: spacing.xs,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceTertiary,
    borderBottomLeftRadius: spacing.xs,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.large,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: slate[200],
  },
});
