/**
 * The two ways out when the catalog does not have it (the website's
 * MissingItemSheet and IdentifySheet): tell us the missing brand or model, or
 * send what is on a laptop's sticker for a person to identify. Neither loses
 * the customer's place.
 */
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useSubmitModelIdentificationMutation, useSubmitRepairCatalogRequestMutation } from '@zappy/core/api';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { FullScreenSheet } from '@zappy/ui/components/common/FullScreenSheet';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={ink[400]} style={[styles.input, props.multiline && styles.area]} {...props} />;
}

export function MissingItemSheet({ kind, brandName, onClose }: { kind: 'brand' | 'model'; brandName?: string; onClose: () => void }) {
  const [form, setForm] = useState({ brandName: '', modelName: '', notes: '' });
  const [submit, { isLoading }] = useSubmitRepairCatalogRequestMutation();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  async function send() {
    try { await submit({ kind, ...form, brandName: form.brandName || brandName }).unwrap(); toast.success("Thanks. We'll add it and let you know."); onClose(); }
    catch (err) { toast.error(errText(err, 'Could not send the request')); }
  }
  return (
    <FullScreenSheet title="Tell us what's missing" onClose={onClose}>
      <Text variant="caption" color={ink[500]}>We'll add it to the catalog. You won't lose your place; we'll message you when it's ready.</Text>
      {kind === 'brand' ? <Field value={form.brandName} onChangeText={set('brandName')} placeholder="Brand name" /> : null}
      <Field value={form.modelName} onChangeText={set('modelName')} placeholder="Model name (e.g. Galaxy A55 5G)" />
      <Field value={form.notes} onChangeText={set('notes')} multiline placeholder="Anything else that helps us identify it" />
      <Button label="Send request" onPress={send} loading={isLoading} disabled={!form.modelName && !form.brandName} fullWidth size="large" />
    </FullScreenSheet>
  );
}

/** Laptop owners often cannot name their machine; a guess becomes the wrong part on the van, so a person identifies it. */
export function IdentifySheet({ vertical, brand, onClose }: { vertical: string; brand?: { code: string; name: string } | null; onClose: () => void }) {
  const [form, setForm] = useState({ modelText: '', productNumber: '', serialNumber: '', notes: '' });
  const [submit, { isLoading }] = useSubmitModelIdentificationMutation();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const hasSomething = Object.values(form).some((v) => v.trim());
  async function send() {
    try { await submit({ vertical, brandCode: brand?.code || '', brandName: brand?.name || '', ...form }).unwrap(); toast.success("Sent. We'll identify it and message you."); onClose(); }
    catch (err) { toast.error(errText(err, 'Could not send that')); }
  }
  return (
    <FullScreenSheet title="Help us identify it" onClose={onClose}>
      <Text variant="caption" color={ink[500]}>Turn the laptop over. The sticker on the base carries a product number; that identifies the exact machine, which decides which parts fit. Anything you can read helps.</Text>
      <Field value={form.modelText} onChangeText={set('modelText')} placeholder="Model name, if you know it" />
      <Field value={form.productNumber} onChangeText={set('productNumber')} autoCapitalize="characters" placeholder="Product number (e.g. 21JK0005IN)" />
      <Field value={form.serialNumber} onChangeText={set('serialNumber')} autoCapitalize="characters" placeholder="Serial number (optional)" />
      <Field value={form.notes} onChangeText={set('notes')} multiline placeholder="Anything else: screen size, year bought, where it was bought" />
      <Button label="Send for identification" onPress={send} loading={isLoading} disabled={!hasSomething} fullWidth size="large" />
      <Text variant="caption" color={ink[400]} style={styles.center}>You can keep browsing; we'll notify you the moment we've identified it.</Text>
    </FullScreenSheet>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  area: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
  center: { textAlign: 'center' },
});
