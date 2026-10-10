/**
 * Shown once per account after an update: what changed, in a few lines.
 * Closing it records the update as seen on the account.
 */
import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Sparkles } from 'lucide-react-native';
import { useMarkReleaseSeenMutation } from '@zappy/core/api';
import { RELEASE } from '@zappy/core/shared/releases';
import { Button, Text } from '..';
import { colors, zappy, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function WhatsNew({ role, appName }: { role: string; appName: string }) {
  const insets = useSafeAreaInsets();
  const [seen, { isLoading }] = useMarkReleaseSeenMutation();
  const items: [string, string][] = (RELEASE as Record<string, unknown>)[role] as [string, string][] || [];
  const close = () => seen(RELEASE.id).catch(() => {});
  if (!items.length) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
          <View style={styles.iconBoxBrand}><Sparkles size={20} color={zappy[600]} /></View>
          <Text variant="heading2" weight="bold">What's new in {appName}</Text>
          {items.map(([title, text]) => (
            <View key={title} style={[styles.row, { alignItems: 'flex-start' }]}>
              <View style={styles.tick}><Check size={12} color="#fff" strokeWidth={3} /></View>
              <View style={styles.flex}><Text variant="body" weight="semibold">{title}</Text><Text variant="bodySmall" color={ink[500]}>{text}</Text></View>
            </View>
          ))}
          <Button label="Got it" onPress={close} loading={isLoading} fullWidth size="large" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBoxBrand: { width: 44, height: 44, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.extraLarge, borderTopRightRadius: radius.extraLarge, padding: spacing.lg, gap: spacing.base },
  tick: { width: 20, height: 20, borderRadius: 10, backgroundColor: zappy[600], alignItems: 'center', justifyContent: 'center', marginTop: 2 },
});
