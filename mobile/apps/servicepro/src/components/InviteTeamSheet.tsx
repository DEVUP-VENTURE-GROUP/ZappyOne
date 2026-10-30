// The website's InviteTeamSheet.
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useInviteShopTeamMutation } from '@zappy/core/api';
import { parseTeamList } from '@zappy/core/shared/partnerBoard';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { FullScreenSheet } from '@zappy/ui/components/common/FullScreenSheet';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, danger, ink, slate, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Row { name?: string; phone: string; ok: boolean; isNew?: boolean; error?: string }

export function InviteTeamSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ added: number; failed: number; rows: Row[] } | null>(null);
  const [invite, { isLoading }] = useInviteShopTeamMutation();
  const rows = parseTeamList(text);

  async function send() {
    try {
      const r = await invite(rows).unwrap();
      setResult(r);
      toast.success(`${r.added} added${r.failed ? `, ${r.failed} need a look` : ''}`);
    } catch (e) { toast.error(errText(e, 'Could not add them')); }
  }

  return (
    <FullScreenSheet title="Add your team" onClose={onClose}>
      {!result ? (
        <>
          <Text variant="caption" color={ink[500]}>One person a line: name and mobile number. Paste from your phone or a sheet.</Text>
          <TextInput value={text} onChangeText={setText} multiline placeholder={'Ravi Kumar, 98480 12345\nSuresh 9701234567'} placeholderTextColor={ink[400]} style={styles.input} textAlignVertical="top" />
          <Text variant="caption" color={ink[500]}>{rows.length} {rows.length === 1 ? 'person' : 'people'} found</Text>
          <Button label={`Add ${rows.length}`} onPress={send} loading={isLoading} disabled={!rows.length} fullWidth size="large" />
        </>
      ) : (
        <>
          {result.rows.map((r, i) => (
            <View key={i} style={styles.row}>
              <Text variant="bodySmall" numberOfLines={1} style={styles.flex}>{r.name || '-'} <Text variant="caption" color={ink[400]}>{r.phone}</Text></Text>
              <Text variant="caption" weight="bold" color={r.ok ? success[600] : danger[600]}>{r.ok ? (r.isNew ? 'Added' : 'Linked') : r.error}</Text>
            </View>
          ))}
          <View style={styles.note}><Text variant="caption" color={ink[500]}>Each person signs in to ServicePro as a shop worker with their number and verifies their ID before taking jobs.</Text></View>
          <Button label="Done" onPress={onClose} fullWidth size="large" />
        </>
      )}
    </FullScreenSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  input: { minHeight: 180, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  note: { padding: spacing.md, borderRadius: radius.medium, backgroundColor: slate[50] },
});
