/**
 * Add or change a saved address (the website's address form): Home / Work /
 * Other, a label, and the place pinned on the map picker. Coordinates always
 * come from the map, never typed.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, MapPin, X } from 'lucide-react-native';
import { Button, Chip, Input, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { usePickLocation, type BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface AddressDraft { label: string; tag: string; place: BookingLocation | null }

const TAGS = ['home', 'work', 'other'];

export function AddressForm({ title, initial, saving, onSave, onCancel }: {
  title?: string; initial: AddressDraft; saving: boolean; onSave: (d: { label: string; tag: string; address: string; lat: number; lng: number }) => void; onCancel: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  const pick = usePickLocation((place) => setDraft((d) => ({ ...d, place })));

  function save() {
    if (!draft.label.trim() || !draft.place) { toast.error(t('profile.toast.fillFields', 'Fill in all fields')); return; }
    onSave({ label: draft.label.trim(), tag: draft.tag, address: draft.place.notes ? `${draft.place.notes}, ${draft.place.address}` : draft.place.address, lat: draft.place.lat, lng: draft.place.lng });
  }

  return (
    <View style={styles.card}>
      {title ? (
        <View style={styles.head}>
          <Text variant="bodySmall" weight="bold">{title}</Text>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('common.cancel', 'Cancel')} hitSlop={8}><X size={15} color={ink[400]} /></Pressable>
        </View>
      ) : null}
      <View style={styles.tags}>{TAGS.map((tag) => <Chip key={tag} label={t(`profile.tag.${tag}`, tag[0].toUpperCase() + tag.slice(1))} selected={draft.tag === tag} onPress={() => setDraft((d) => ({ ...d, tag }))} />)}</View>
      <Input value={draft.label} onChangeText={(label) => setDraft((d) => ({ ...d, label }))} placeholder={t('profile.labelPlaceholder', "Label (e.g. Mom's House)")} />
      {draft.place ? (
        <View style={styles.pinned}><Check size={13} color={success[600]} /><Text variant="caption" weight="semibold" color={success[700]} style={styles.flex} numberOfLines={2}>{t('profile.locationPinned', 'Location pinned')}, {draft.place.address}</Text></View>
      ) : null}
      <Button label={draft.place ? t('profile.searchToChange', 'Change on the map') : t('profile.searchAddress', 'Pin your address on the map')} variant="outline" size="small"
        icon={<MapPin size={14} color={zappy[600]} />} onPress={() => pick(draft.place)} fullWidth />
      <View style={styles.actions}>
        <View style={styles.flex}><Button label={t('common.cancel', 'Cancel')} variant="outline" onPress={onCancel} fullWidth /></View>
        <View style={styles.flex}><Button label={t('profile.saveAddress', 'Save Address')} loading={saving} onPress={save} fullWidth /></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: slate[50] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tags: { flexDirection: 'row', gap: spacing.sm },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
