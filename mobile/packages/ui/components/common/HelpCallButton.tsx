// One tap from any ServicePro page to call ZappyOne, so we hear about a problem while it is happening.
import React from 'react';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { PhoneCall } from 'lucide-react-native';
import { STAFF_HELP_PHONE } from '@zappy/core/shared/partnerPages';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Text } from '../Text';
import { danger } from '../../theme/colors';
import { useT } from '../../lib/i18n';

const PROVIDER_ROLES = ['worker', 'shop'];

export function HelpCallButton() {
  const t = useT();
  const role = useAppSelector((s) => s.auth.role);
  if (!PROVIDER_ROLES.includes(String(role))) return null;
  return (
    <Pressable onPress={() => { void Linking.openURL(`tel:+91${STAFF_HELP_PHONE}`); }} accessibilityRole="button"
      accessibilityLabel={t('sp.call_zappyone_help', 'Call ZappyOne help')} hitSlop={6} style={styles.pill}>
      <PhoneCall size={14} color={danger[600]} strokeWidth={2.4} />
      <Text variant="caption" weight="bold" color={danger[600]}>{t('sp.help', 'Help')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: 11, borderRadius: 999, backgroundColor: danger[50] },
});
