/**
 * Saved addresses (the website's Profile section): add, edit in place, make
 * the default, remove. Each row shows its tag, label and the address.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Briefcase, Check, Home, MapPin, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useAddAddressMutation, useDeleteAddressMutation, useEditAddressMutation, useGetAddressesQuery, useSetDefaultAddressMutation } from '@zappy/core/api';
import { Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, danger, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { AddressForm, type AddressDraft } from './AddressForm';

interface Address { _id: string; label: string; address: string; tag?: string; isDefault?: boolean; location?: { coordinates?: [number, number] } }

const TAG_ICON = { home: [Home, zappy[600], zappy[50]], work: [Briefcase, '#7C3AED', '#F3EEFF'], other: [MapPin, ink[500], slate[100]] } as const;
const EMPTY: AddressDraft = { label: '', tag: 'other', place: null };

function IconBtn({ onPress, bg, children, label }: { onPress: () => void; bg: string; children: React.ReactNode; label: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={[styles.iconBtn, { backgroundColor: bg }]}>{children}</Pressable>;
}

export function SavedAddresses() {
  const t = useT();
  const { data } = useGetAddressesQuery(undefined);
  const [add, { isLoading: adding }] = useAddAddressMutation();
  const [edit, { isLoading: editing }] = useEditAddressMutation();
  const [remove] = useDeleteAddressMutation();
  const [makeDefault] = useSetDefaultAddressMutation();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const addresses: Address[] = data?.addresses || [];

  async function run(p: Promise<unknown>, ok: string, fail: string) {
    try { await p; toast.success(ok); return true; } catch { toast.error(fail); return false; }
  }

  return (
    <View style={styles.gap}>
      <View style={styles.head}>
        <Text variant="caption" weight="black" color={ink[400]} style={styles.title}>{t('profile.savedAddresses', 'Saved Addresses').toUpperCase()}</Text>
        <Pressable onPress={() => setShowAdd((v) => !v)} accessibilityRole="button" style={styles.add}><Plus size={12} color={zappy[600]} /><Text variant="caption" weight="bold" color={zappy[600]}>{t('common.add', 'Add')}</Text></Pressable>
      </View>
      {showAdd ? (
        <AddressForm title={t('profile.newAddress', 'New Address')} initial={EMPTY} saving={adding} onCancel={() => setShowAdd(false)}
          onSave={async (d) => { if (await run(add(d).unwrap(), t('profile.toast.addressSaved', 'Address saved'), t('profile.toast.saveFailed', 'Could not save address'))) setShowAdd(false); }} />
      ) : null}
      {addresses.length ? (
        <View style={styles.card}>
          {addresses.map((a, i) => {
            const [Icon, fg, bg] = TAG_ICON[(a.tag as keyof typeof TAG_ICON) || 'other'] || TAG_ICON.other;
            const [lng, lat] = a.location?.coordinates || [0, 0];
            return (
              <View key={a._id} style={i > 0 && styles.rule}>
                <View style={styles.row}>
                  <View style={[styles.tagIcon, { backgroundColor: bg }]}><Icon size={13} color={fg} /></View>
                  <View style={styles.flex}>
                    <View style={styles.inline}>
                      <Text variant="caption" weight="bold" color={ink[500]}>{a.label.toUpperCase()}</Text>
                      {a.isDefault ? <View style={styles.default}><Text variant="caption" weight="black" color={zappy[600]}>{t('profile.default', 'Default')}</Text></View> : null}
                    </View>
                    <Text variant="bodySmall" weight="medium" numberOfLines={1}>{a.address}</Text>
                  </View>
                  {!a.isDefault ? <IconBtn label={t('profile.setDefault', 'Set as default')} bg={accent[50]} onPress={() => run(makeDefault(a._id).unwrap(), t('profile.toast.defaultSet', 'Default address set'), t('profile.toast.defaultFailed', 'Could not set default'))}><Check size={12} color={accent[600]} /></IconBtn> : null}
                  <IconBtn label={t('common.edit', 'Edit')} bg={zappy[50]} onPress={() => setEditingId(editingId === a._id ? null : a._id)}><Pencil size={12} color={zappy[600]} /></IconBtn>
                  <IconBtn label={t('common.delete', 'Delete')} bg={danger[50]} onPress={() => run(remove(a._id).unwrap(), `${t('profile.toast.removed', 'Removed')} ${a.label}`, t('profile.toast.deleteFailed', 'Could not delete address'))}><Trash2 size={12} color={danger[500]} /></IconBtn>
                </View>
                {editingId === a._id ? (
                  <View style={styles.editWrap}>
                    <AddressForm initial={{ label: a.label, tag: a.tag || 'other', place: { lat, lng, address: a.address } }} saving={editing} onCancel={() => setEditingId(null)}
                      onSave={async (d) => { if (await run(edit({ addrId: a._id, ...d }).unwrap(), t('profile.toast.addressUpdated', 'Address updated'), t('profile.toast.updateFailed', 'Could not update address'))) setEditingId(null); }} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : !showAdd ? (
        <Pressable onPress={() => setShowAdd(true)} accessibilityRole="button" style={[styles.card, styles.empty]}>
          <MapPin size={18} color={slate[300]} />
          <Text variant="bodySmall" color={ink[400]}>{t('profile.noAddresses', 'No saved addresses yet')}</Text>
          <Text variant="caption" weight="bold" color={zappy[600]}>{t('profile.addHomeWork', 'Add Home or Work')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base },
  title: { letterSpacing: 1.2 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  rule: { borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  tagIcon: { width: 32, height: 32, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  default: { borderRadius: radius.pill, paddingHorizontal: 6, backgroundColor: zappy[50] },
  iconBtn: { width: 30, height: 30, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  editWrap: { padding: spacing.sm },
  empty: { alignItems: 'center', gap: 4, paddingVertical: spacing.lg },
});
