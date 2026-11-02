import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEditJobContactMutation } from '@zappy/core/api';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, slate } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { TrackedJob } from '../types';

type OnSite = { name: string; phone: string } | null;

// Who the pro meets at the door (the website's ContactSheet): someone else's name and number, or the booker themselves.
export function ContactSheet({ job, onSite, onClose, onSaved }: { job: TrackedJob; onSite: OnSite; onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(onSite?.name || '');
  const [phone, setPhone] = useState(onSite?.phone || '');
  const [save, { isLoading }] = useEditJobContactMutation();
  const valid = name.trim().length >= 2 && /^[6-9]\d{9}$/.test(phone);

  async function submit(value: OnSite) {
    try {
      const r = await save({ id: job.id, onSite: value }).unwrap();
      toast.success(r.message);
      onSaved();
      onClose();
    } catch (err) { toast.error(errText(err, 'Could not save that. Try again.')); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.base }]}>
        <Text variant="heading3" weight="extrabold">Who will be there?</Text>
        <Text variant="bodySmall" color={ink[500]}>Your pro calls this person when they arrive, not you.</Text>
        <Text variant="caption" weight="semibold" color={ink[700]} style={styles.label}>Name</Text>
        <TextInput value={name} onChangeText={setName} maxLength={60} style={styles.input} accessibilityLabel="Name" />
        <Text variant="caption" weight="semibold" color={ink[700]} style={styles.label}>Mobile number</Text>
        <View style={[styles.input, styles.phone]}>
          <Text variant="body" color={ink[500]}>+91</Text>
          <TextInput value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" style={styles.phoneInput} accessibilityLabel="Mobile number" />
        </View>
        <View style={styles.actions}>
          <View style={styles.flex}>
            {onSite
              ? <Button label="I'll be there" variant="outline" onPress={() => submit(null)} disabled={isLoading} fullWidth />
              : <Button label="Cancel" variant="outline" onPress={onClose} fullWidth />}
          </View>
          <View style={styles.flex}><Button label="Save" onPress={() => submit({ name: name.trim(), phone })} loading={isLoading} disabled={!valid} fullWidth /></View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  label: { marginTop: spacing.sm },
  input: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: slate[200], fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900] },
  phone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phoneInput: { flex: 1, minHeight: 42, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900] },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex: { flex: 1 },
});
