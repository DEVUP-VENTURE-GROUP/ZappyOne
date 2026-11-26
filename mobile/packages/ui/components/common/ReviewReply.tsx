import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { ink, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function ReviewReply({ reply, name }: { reply?: { text: string } | null; name?: string }) {
  if (!reply?.text) return null;
  return (
    <View style={styles.box}>
      <Text variant="caption" weight="semibold" color={ink[700]}>Reply from {name || 'the pro'}</Text>
      <Text variant="bodySmall" color={ink[900]}>{reply.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: slate[100], borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
});
