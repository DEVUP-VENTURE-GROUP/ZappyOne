/**
 * Verification, as the provider sees it (the websites' MyDocumentsPage).
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAppSelector } from '@zappy/core/store/hooks';
import { ScreenHeader } from '../../components';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { MyVerificationPanel } from '../MyVerificationPanel';

/** Verification, as the provider sees it: what they uploaded and where each service stands. */
export function MyDocumentsPage() {
  const isShop = useAppSelector((s) => s.auth.role) === 'shop';
  return (
    <View style={styles.page}>
      <ScreenHeader title="My documents" safeArea />
      <ScrollView contentContainerStyle={styles.body}>
        <MyVerificationPanel isShop={isShop} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
});
