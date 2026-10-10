/**
 * The chat button on a job screen; opens the job's messages.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { Text } from '..';
import { RIPPLE } from '../../lib/feedback';
import { colors, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { JobChat } from './JobChat';

export function JobChatButton({ jobId, title = 'Your customer' }: { jobId?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  if (!jobId) return null;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.msgBtn}>
        <MessageCircle size={16} color={ink[900]} /><Text variant="bodySmall" weight="semibold">Message</Text>
      </Pressable>
      {open ? <JobChat jobId={jobId} title={title} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  msgBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 40 },
});
