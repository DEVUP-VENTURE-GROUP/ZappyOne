/**
 * The conversation surface shared by tickets and disputes.
 * ----------------------------------------------------------------------------
 * Both models carry the same `messages: [{ from, text, at }]` array and both
 * threads behave identically — support on the left, you on the right, composer
 * hidden once the thread is resolved or closed. So this is one component used
 * twice rather than two near-identical screens, which is also what keeps the
 * bubble styling from drifting apart later.
 *
 * The right-hand bubble is navy (`colors.textHeading`), matching the website's
 * `bg-[#0F172A]` — deliberately NOT brand blue, which reads as a button.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Send } from 'lucide-react-native';
import { IconButton, Text } from '../ui';
import { colors, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { ThreadMessage } from '../../types/api';

/** How the far side is named in the thread. */
export type SupportSide = 'Zappy Support' | 'Support Team';

interface BubbleProps {
  message: ThreadMessage;
  supportLabel: SupportSide;
}

function formatAt(at?: string): string {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MessageBubbleBase({ message, supportLabel }: BubbleProps) {
  const fromSupport = message.from === 'admin';
  return (
    <View style={[styles.row, fromSupport ? styles.rowLeft : styles.rowRight]}>
      <View style={[styles.bubble, fromSupport ? styles.bubbleSupport : styles.bubbleMine]}>
        {fromSupport ? (
          <Text variant="label" color={colors.textSecondary} style={styles.author}>
            {supportLabel}
          </Text>
        ) : null}
        <Text
          variant="bodySmall"
          color={fromSupport ? colors.textPrimary : colors.textInverse}
        >
          {message.text}
        </Text>
        <Text
          variant="caption"
          color={fromSupport ? colors.textMuted : 'rgba(255,255,255,0.55)'}
          style={styles.time}
        >
          {formatAt(message.at)}
        </Text>
      </View>
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleBase);

export interface ComposerProps {
  placeholder: string;
  sending: boolean;
  onSend: (text: string) => Promise<void> | void;
}

/**
 * The reply box. Owns its own draft so a keystroke doesn't re-render the whole
 * thread, and clears only after the send resolves — a failed send keeps what
 * was typed, which is the difference between a retry and a retype.
 */
function ComposerBase({ placeholder, sending, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const trimmed = text.trim();

  const submit = useCallback(async () => {
    if (!trimmed || sending) return;
    await onSend(trimmed);
    setText('');
  }, [trimmed, sending, onSend]);

  return (
    <View style={styles.composer}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={2000}
        style={styles.input}
        accessibilityLabel={placeholder}
      />
      <IconButton
        icon={<Send size={17} color={colors.textInverse} />}
        onPress={submit}
        variant="primary"
        disabled={!trimmed || sending}
        accessibilityLabel="Send message"
      />
    </View>
  );
}

export const Composer = memo(ComposerBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: spacing.md },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.large,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  bubbleSupport: { backgroundColor: slate[100], borderTopLeftRadius: radius.small },
  bubbleMine: { backgroundColor: colors.textHeading, borderTopRightRadius: radius.small },
  author: { marginBottom: spacing.xxs },
  time: { marginTop: spacing.xs },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
});
