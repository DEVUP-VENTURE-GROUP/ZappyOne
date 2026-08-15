import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSelector } from 'react-redux';
import { ChevronLeft, Send } from 'lucide-react-native';
import { useSocket } from '../../hooks/useSocket';
import { useGetChatMessagesQuery, useSendChatMessageMutation } from '../../services/api/ordersApi';
import type { RootState } from '../../store';
import type { ChatMessage } from '../../types/api';

/**
 * Sending goes over HTTP (`POST /orders/:id/chat`), not the socket — the
 * canonical event contract (services/socket/events.ts) has no client→server
 * `chat.send` event. The server broadcasts the resulting `chat.message` to
 * the order room over the socket, which is what live-updates the other
 * party. The previous version emitted a socket event the server has never
 * listened for, so nothing sent that way ever reached the worker.
 */
export default function ChatScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [text, setText] = useState('');
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const socketClient = useSocket(orderId);
  const user = useSelector((state: RootState) => state.auth.user);

  const { data: history = [], isLoading } = useGetChatMessagesQuery({ orderId: String(orderId) });
  const [sendChatMessage, { isLoading: sending }] = useSendChatMessageMutation();

  useEffect(() => {
    const handler = (msg: ChatMessage) => setLiveMessages((prev) => [...prev, msg]);
    socketClient.on('chat.message', handler);
    return () => socketClient.off('chat.message', handler);
  }, [socketClient]);

  // De-dupe: a message we sent may arrive both in the mutation response's
  // cache invalidation AND as a live socket echo.
  const messages = [...history, ...liveMessages].filter(
    (m, i, arr) => arr.findIndex((x) => x._id === m._id) === i,
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
    const isMe = item.from?.kind === 'user' && item.from.id === user?._id;
    return (
      <View className={`p-3 rounded-2xl max-w-[80%] my-1 ${isMe ? 'bg-primary self-end' : 'bg-gray-100 self-start'}`}>
        <Text className={isMe ? 'text-white' : 'text-navy'}>{item.text}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="p-4 border-b border-gray-100 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center mr-3">
            <ChevronLeft size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-navy">Order Chat</Text>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563EB" /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item._id}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 16 }}
            className="flex-1"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <Text className="text-center text-gray-400 mt-10">Say hello — your pro will see it right away.</Text>
            }
          />
        )}

        <View className="p-4 border-t border-gray-100 flex-row items-center">
          <TextInput
            className="flex-1 bg-gray-100 rounded-full px-4 py-3 mr-3"
            placeholder="Type a message..."
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            className="bg-primary w-12 h-12 rounded-full items-center justify-center"
            onPress={handleSend}
            disabled={sending || !text.trim()}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Send size={20} color="white" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
