/**
 * A full-screen sheet with a title and a close button, for forms that open
 * over a page (set a goal, add a bank account, take a quiz).
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Text } from '..';
import { colors, ink } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

export function FullScreenSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={[styles.between, styles.sheetHead]}>
          <Text variant="heading3" weight="black" style={styles.flex} numberOfLines={1}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><X size={20} color={ink[700]} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 140 },
  sheetHead: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
});
