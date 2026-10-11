/** One item on a shopping list (the website's item card): name, quantity, its own price ceiling, brand, variant, notes, and a reference photo. */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Input, Text } from '@zappy/ui/components';
import { ImageUploadField } from '@zappy/ui/components/common/ImageUploadField';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface ShopItem { key: string; name: string; quantity: number; preferredBrand: string; preferredSize: string; preferredVariant: string; maxApprovedPricePaise: string; notes: string; referenceImageKey: string }

export const emptyItem = (): ShopItem => ({ key: Math.random().toString(36).slice(2), name: '', quantity: 1, preferredBrand: '', preferredSize: '', preferredVariant: '', maxApprovedPricePaise: '', notes: '', referenceImageKey: '' });

export const ShoppingItemCard = memo(function ShoppingItemCard({ item, index, removable, onChange, onRemove }: { item: ShopItem; index: number; removable: boolean; onChange: (patch: Partial<ShopItem>) => void; onRemove: () => void }) {
  const t = useT();
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text variant="caption" weight="bold" color={ink[400]}>{t('shop.item', 'Item')} {index + 1}</Text>
        {removable ? <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={t('common.delete', 'Delete')} hitSlop={8}><Trash2 size={15} color={slate[300]} /></Pressable> : null}
      </View>
      <Input value={item.name} onChangeText={(name) => onChange({ name })} placeholder={t('shop.itemHint', 'e.g. 12W LED bulb')} />
      <View style={styles.row}>
        <View style={styles.flex}><Input value={String(item.quantity)} onChangeText={(v) => onChange({ quantity: Math.max(1, Number(v) || 1) })} keyboardType="number-pad" placeholder={t('shop.qty', 'Qty')} /></View>
        <View style={styles.flex}><Input value={item.maxApprovedPricePaise} onChangeText={(v) => onChange({ maxApprovedPricePaise: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder={t('shop.max', 'Max price ₹')} /></View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}><Input value={item.preferredBrand} onChangeText={(v) => onChange({ preferredBrand: v })} placeholder={t('shop.brand', 'Brand (any)')} /></View>
        <View style={styles.flex}><Input value={item.preferredVariant} onChangeText={(v) => onChange({ preferredVariant: v })} placeholder={t('shop.variant', 'Variant / size')} /></View>
      </View>
      <Input value={item.notes} onChangeText={(v) => onChange({ notes: v })} placeholder={t('shop.notes', 'Notes for the helper (optional)')} />
      <ImageUploadField value={item.referenceImageKey} onChange={(v) => onChange({ referenceImageKey: v })} folder="helping/items" label="reference photo" />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
