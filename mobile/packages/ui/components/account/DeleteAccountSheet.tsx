/** Delete the account, typed DELETE to confirm (the website's DeleteConfirmSheet). Data is anonymised within 30 days. */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, Button, Input, Text } from '..';
import { useT } from '../../lib/i18n';
import { danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function DeleteAccountSheet({ visible, onClose, onConfirm, loading }: { visible: boolean; onClose: () => void; onConfirm: () => void; loading: boolean }) {
  const t = useT();
  const [typed, setTyped] = useState('');
  useEffect(() => { if (visible) setTyped(''); }, [visible]);
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('security.delete', 'Delete Account')}>
      <View style={styles.body}>
        <View style={styles.warn}>
          <Text variant="bodySmall" weight="medium" color={danger[600]}>{t('security.permanent', 'This action is permanent.')}</Text>
          <Text variant="caption" color={danger[600]}>{t('security.deleteNote', 'Your sign-in, name, contact details, photo and saved details are removed now. Past bookings and payments are kept without your details. Open jobs must be finished first.')}</Text>
        </View>
        <Input label={t('security.typeDelete', 'Type DELETE to confirm')} value={typed} onChangeText={setTyped} placeholder="DELETE" autoCapitalize="characters" />
        <Button label={loading ? t('security.deleting', 'Deleting…') : t('security.deleteForever', 'Permanently Delete Account')} variant="danger" loading={loading} disabled={typed !== 'DELETE'} onPress={onConfirm} fullWidth />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.lg },
  warn: { gap: 4, padding: spacing.md, borderRadius: radius.large, backgroundColor: danger[50] },
});
