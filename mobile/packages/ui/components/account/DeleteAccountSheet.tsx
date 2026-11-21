/** Delete the account (the website's DeleteAccountSection): what is in the way first, then why they are leaving, then typed DELETE (server: account/account-deletion). */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { useDeletionCheckQuery } from '@zappy/core/api';
import { BottomSheet, Button, Chip, Input, Skeleton, Text } from '..';
import { useT } from '../../lib/i18n';
import { accent, danger, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

type Check = { canDelete: boolean; blockers: { code: string; message: string }[]; reasons: { code: string; label: string }[] };

export function DeleteAccountSheet({ visible, onClose, onConfirm, loading }: { visible: boolean; onClose: () => void; onConfirm: (reason: string, note: string) => void; loading: boolean }) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useDeletionCheckQuery(undefined, { skip: !visible, refetchOnMountOrArgChange: true }) as { data?: Check; isLoading: boolean; isError: boolean; refetch: () => void };
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (visible) { setTyped(''); setReason(''); setNote(''); } }, [visible]);
  const blockers = data?.blockers || [];

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('security.delete', 'Delete Account')}>
      <View style={styles.body}>
        {isLoading ? <View style={styles.body}><Skeleton width="70%" height={14} /><Skeleton width="100%" height={56} /></View> : null}
        {isError ? (
          <View style={styles.row}><Text variant="caption" color={ink[700]}>{t('security.checkFailed', 'We could not check your account just now.')} </Text>
            <Text variant="caption" weight="bold" color={danger[600]} onPress={refetch}>{t('common.retry', 'Try again')}</Text></View>
        ) : null}

        {data && blockers.length ? (
          <View style={styles.body}>
            <Text variant="bodySmall" weight="medium">{t('security.sortFirst', 'Sort these out first, then you can delete your account:')}</Text>
            {blockers.map((b) => (
              <View key={b.code} style={styles.blocker}><CircleAlert size={16} color={accent[700]} /><Text variant="caption" color={accent[700]} style={styles.flex}>{b.message}</Text></View>
            ))}
          </View>
        ) : null}

        {data?.canDelete ? (
          <>
            <View style={styles.warn}>
              <Text variant="bodySmall" weight="medium" color={danger[600]}>{t('security.permanent', 'This action is permanent.')}</Text>
              <Text variant="caption" color={danger[600]}>{t('security.deleteNote', 'Your sign-in, name, contact details, photo and saved details are removed now. Past bookings and payments are kept without your details.')}</Text>
            </View>
            <Text variant="caption" weight="bold" color={ink[700]}>{t('security.why', 'Why are you leaving?')}</Text>
            <View style={styles.chips}>{data.reasons.map((r) => <Chip key={r.code} label={r.label} selected={reason === r.code} onPress={() => setReason(r.code)} />)}</View>
            <Input label={t('security.note', 'Anything we should know? (optional)')} value={note} onChangeText={setNote} maxLength={500} multiline multilineHeight={72} />
            <Input label={t('security.typeDelete', 'Type DELETE to confirm')} value={typed} onChangeText={setTyped} placeholder="DELETE" autoCapitalize="characters" />
            <Button label={loading ? t('security.deleting', 'Deleting…') : t('security.deleteForever', 'Permanently Delete Account')} variant="danger" loading={loading}
              disabled={typed !== 'DELETE' || !reason} onPress={() => onConfirm(reason, note.trim())} fullWidth />
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  blocker: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, backgroundColor: accent[50] },
  warn: { gap: 4, padding: spacing.md, borderRadius: radius.large, backgroundColor: danger[50] },
});
