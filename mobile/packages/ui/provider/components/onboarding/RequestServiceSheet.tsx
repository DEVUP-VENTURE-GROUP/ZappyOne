/** A provider proposes a service we do not carry yet; the team reviews it. */
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useProviderRequestServiceLineMutation } from '@zappy/core/api';
import { Button, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { FullScreenSheet } from '../../../components/common/FullScreenSheet';
import { errText } from '../../../lib/feedback';
import { colors, ink } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import type { Domain } from './DomainStep';

export function RequestServiceSheet({ domain, onClose }: { domain: Domain | null; onClose: () => void }) {
  const [form, setForm] = useState({ proposedName: '', description: '' });
  const [submit, { isLoading }] = useProviderRequestServiceLineMutation();

  async function send() {
    try {
      await submit({ domainCode: domain?.code || '', ...form }).unwrap();
      toast.success("Sent. We'll review it and get back to you.");
      onClose();
    } catch (err) { toast.error(errText(err, 'Could not send that')); }
  }

  return (
    <FullScreenSheet title="Tell us what you do" onClose={onClose}>
      <Text variant="caption" color={ink[500]}>
        If enough providers ask for the same work, we open it, with proper pricing and verification behind it rather than a listing that goes nowhere.
      </Text>
      <TextInput value={form.proposedName} onChangeText={(v) => setForm((f) => ({ ...f, proposedName: v }))} placeholder="Service name (e.g. Smart Watch Repair)"
        placeholderTextColor={ink[400]} style={styles.input} />
      <TextInput value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline placeholder="What exactly do you do, and how long have you done it?"
        placeholderTextColor={ink[400]} style={[styles.input, styles.area]} />
      <Button label="Send request" onPress={send} loading={isLoading} disabled={!form.proposedName.trim()} fullWidth size="large" />
    </FullScreenSheet>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  area: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
});
