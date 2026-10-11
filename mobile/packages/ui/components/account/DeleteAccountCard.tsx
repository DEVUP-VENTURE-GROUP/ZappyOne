/**
 * Delete this account, from inside any app (Google Play account deletion):
 * what happens said first, typed DELETE to confirm, then the server's
 * deletion (account/account-deletion) and sign-out. When the server refuses
 * (a job still open, money still in the wallet) its reason is shown as is.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useDeleteAccountMutation } from '@zappy/core/api';
import { useSignOut } from '@zappy/core/hooks/useSignOut';
import { Button, Text } from '..';
import { toast } from '../Toast';
import { errText } from '../../lib/feedback';
import { useT } from '../../lib/i18n';
import { colors, danger, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { DeleteAccountSheet } from './DeleteAccountSheet';

export function DeleteAccountCard() {
  const t = useT();
  const signOut = useSignOut();
  const [deleteAccount, { isLoading }] = useDeleteAccountMutation();
  const [open, setOpen] = useState(false);

  async function confirm() {
    try {
      await deleteAccount(undefined).unwrap();
      setOpen(false);
      toast.success(t('security.deleted', 'Your account has been deleted'));
      await signOut();
    } catch (err) { toast.error(errText(err, t('security.deleteFailed', 'Could not delete the account. Try again.'))); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}><AlertTriangle size={16} color={danger[500]} /><Text variant="bodySmall" weight="semibold" color={danger[600]}>{t('security.dangerZone', 'Delete account')}</Text></View>
      <Text variant="caption" color={ink[500]}>{t('security.dangerNote', 'This removes your sign-in, name, contact details, photo, saved addresses and payout details, and signs you out everywhere. Past bookings and payments are kept without your details, as the law requires. Finish any open job and withdraw your wallet first.')}</Text>
      <Button label={t('security.deleteMine', 'Delete my account')} variant="outline" onPress={() => setOpen(true)} fullWidth />
      <DeleteAccountSheet visible={open} onClose={() => setOpen(false)} onConfirm={confirm} loading={isLoading} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: danger[100], backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
