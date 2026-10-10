/** Propose a repair the catalog is missing, under one heading; the team reviews it. */
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useRequestRepairCatalogAdditionMutation } from '@zappy/core/api';
import { Button, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { FullScreenSheet } from '../../../components/common/FullScreenSheet';
import { errText } from '../../../lib/feedback';
import { colors, ink } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';

export function MissingWorkSheet({ vertical, group, cityCode, onClose }: { vertical: string; group?: { code: string; name: string } | null; cityCode: string; onClose: () => void }) {
  const [form, setForm] = useState({ proposedName: '', description: '' });
  const [submit, { isLoading }] = useRequestRepairCatalogAdditionMutation();

  async function send() {
    try {
      await submit({ vertical, categoryCode: group?.code || '', cityCode, ...form }).unwrap();
      toast.success("Sent. We'll review it and add it if it checks out.");
      onClose();
    } catch (err) { toast.error(errText(err, 'Could not send that')); }
  }

  return (
    <FullScreenSheet title="Add a job we don't list" onClose={onClose}>
      <Text variant="caption" color={ink[500]}>
        Under <Text variant="caption" weight="semibold">{group?.name || 'this heading'}</Text>. We check it before customers can book it: it needs a price, a skill level and a quality check behind it. Approved jobs start in your city only.
      </Text>
      <TextInput value={form.proposedName} onChangeText={(v) => setForm((f) => ({ ...f, proposedName: v }))} placeholder="What is the job called?" placeholderTextColor={ink[400]} style={styles.input} />
      <TextInput value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline placeholder="What does it involve, and roughly how long does it take?"
        placeholderTextColor={ink[400]} style={[styles.input, styles.area]} />
      <Button label="Send for review" onPress={send} loading={isLoading} disabled={!form.proposedName.trim()} fullWidth size="large" />
    </FullScreenSheet>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  area: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
});
