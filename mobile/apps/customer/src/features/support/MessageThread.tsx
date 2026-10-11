/**
 * A conversation with the ZappyOne team (support tickets and disputes):
 * the team on the left with its name, the customer on the right, newest at
 * the bottom, and a reply box while the case is open.
 */
import { useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Send } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface ThreadMsg { from: string; text: string; at: string }

export function MessageThread({ messages, teamLabel, open, sending, placeholder, onSend, header, footer }: {
  messages: ThreadMsg[]; teamLabel: string; open: boolean; sending: boolean; placeholder: string;
  onSend: (text: string) => Promise<boolean>; header?: ReactElement | null; footer?: ReactElement | null;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const list = useRef<FlatList<ThreadMsg>>(null);

  async function send() {
    const body = text.trim();
    if (body && await onSend(body)) setText('');
  }

  return (
    <>
      <FlatList ref={list} data={messages} keyExtractor={(m, i) => `${m.at}-${i}`} contentContainerStyle={styles.msgs}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })} ListHeaderComponent={header} ListFooterComponent={footer}
        renderItem={({ item: m }) => {
          const team = m.from === 'admin';
          return (
            <View style={[styles.bubble, team ? styles.them : styles.me]}>
              {team ? <Text variant="caption" weight="black" color={ink[500]}>{teamLabel.toUpperCase()}</Text> : null}
              <Text variant="bodySmall" color={team ? ink[900] : '#fff'}>{m.text}</Text>
              <Text variant="caption" color={team ? ink[400] : 'rgba(255,255,255,0.55)'}>{new Date(m.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          );
        }} />
      {open ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={ink[400]} multiline style={styles.input} />
          <Pressable onPress={send} disabled={sending || !text.trim()} accessibilityRole="button" accessibilityLabel="Send" style={[styles.send, (sending || !text.trim()) && styles.dim]}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={15} color="#fff" />}
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  msgs: { gap: spacing.md, padding: spacing.base },
  bubble: { maxWidth: '80%', gap: 2, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.large },
  them: { alignSelf: 'flex-start', backgroundColor: slate[100] },
  me: { alignSelf: 'flex-end', backgroundColor: ink[900] },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.base, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, color: ink[900], fontFamily: 'Figtree-Regular', fontSize: 14 },
  send: { width: 44, height: 44, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: ink[900] },
  dim: { opacity: 0.4 },
});
