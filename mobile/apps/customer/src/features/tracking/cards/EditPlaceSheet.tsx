import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin } from 'lucide-react-native';
import { useEditJobPlaceMutation } from '@zappy/core/api';
import { Button, Text } from '@zappy/ui/components';
import { LocationPicker } from '@zappy/ui/components/common/LocationPicker';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { TrackedJob } from '../types';

// Edit on booking details (the website's EditPlaceSheet): fix the address, add door directions, or nudge the pin; the server caps the move.
export function EditPlaceSheet({ job, maxMoveM = 500, onClose, onSaved }: { job: TrackedJob; maxMoveM?: number; onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState(job.place?.address || '');
  const [directions, setDirections] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [save, { isLoading }] = useEditJobPlaceMutation();
  const directionsOn = job.kind === 'repair';

  async function submit() {
    try {
      const r = await save({ id: job.id, address, ...(directionsOn && directions ? { directions } : {}), ...(pin ? { lat: pin.lat, lng: pin.lng } : {}) }).unwrap();
      toast.success(r.message);
      onSaved();
      onClose();
    } catch (err) { toast.error(errText(err, 'Could not save that. Try again.')); }
  }

  if (picking) {
    return (
      <LocationPicker title="Move the pin" initial={job.place?.lat != null && job.place?.lng != null ? { lat: job.place.lat, lng: job.place.lng, address } : null}
        onCancel={() => setPicking(false)} onConfirm={(p) => { setPin({ lat: p.lat, lng: p.lng }); if (p.address) setAddress(p.address); setPicking(false); }} />
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.base }]}>
        <Text variant="heading3" weight="extrabold">Edit address</Text>
        <Text variant="bodySmall" color={ink[500]}>You can move the pin up to {maxMoveM} m. For a different address, cancel and book again.</Text>
        <Text variant="caption" weight="semibold" color={ink[700]} style={styles.label}>Address</Text>
        <TextInput value={address} onChangeText={setAddress} multiline maxLength={300} style={[styles.input, styles.area]} accessibilityLabel="Address" />
        {directionsOn ? (
          <>
            <Text variant="caption" weight="semibold" color={ink[700]} style={styles.label}>Door directions (optional)</Text>
            <TextInput value={directions} onChangeText={setDirections} maxLength={200} placeholder="Gate 2, third floor, blue door" placeholderTextColor={ink[400]} style={styles.input} accessibilityLabel="Door directions" />
          </>
        ) : null}
        <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={styles.pin}>
          <MapPin size={16} color={zappy[700]} />
          <Text variant="bodySmall" weight="bold" color={zappy[700]}>{pin ? 'Pin moved. Move again' : 'Move the pin'}</Text>
        </Pressable>
        <View style={styles.actions}>
          <View style={styles.flex}><Button label="Keep as is" variant="outline" onPress={onClose} fullWidth /></View>
          <View style={styles.flex}><Button label="Save" onPress={submit} loading={isLoading} disabled={!address.trim()} fullWidth /></View>
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
  area: { minHeight: 64, paddingTop: 10, textAlignVertical: 'top' },
  pin: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex: { flex: 1 },
});
