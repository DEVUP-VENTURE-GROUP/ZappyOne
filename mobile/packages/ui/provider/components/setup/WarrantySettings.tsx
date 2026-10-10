/**
 * The warranty the shop gives, per repair. It rides on every price the shop has
 * for that repair and is what the customer is shown and can claim against.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useSetShopWarrantyMutation } from '@zappy/core/api';
import { BottomSheet, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { RIPPLE, errText } from '../../../lib/feedback';
import { colors, ink, slate, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { WARRANTY_CHOICES, warrantyOf, type ClaimedRepair, type PriceRowData } from './priceSheet';

const label = (days: number) => (days ? `${days} days` : 'No warranty');

export function WarrantySettings({ vertical, claimed, rows, onSaved }: { vertical: string; claimed: ClaimedRepair[]; rows: PriceRowData[]; onSaved?: () => void }) {
  const [setWarranty] = useSetShopWarrantyMutation();
  const [picking, setPicking] = useState<ClaimedRepair | null>(null);

  async function change(code: string, days: number) {
    try {
      const res = await setWarranty({ vertical, repairCode: code, warrantyDays: days }).unwrap();
      toast.success(res.updated ? `Warranty set to ${days ? `${days} days` : 'none'}` : 'Saved. It applies once you set a price for this job.');
      onSaved?.();
    } catch (err) { toast.error(errText(err, 'Could not save the warranty')); }
  }

  const current = picking ? warrantyOf(rows, picking.code, picking.warrantyDays) : 0;
  return (
    <View style={styles.card}>
      <Text variant="caption" weight="bold" color={ink[500]}>WARRANTY YOU GIVE</Text>
      <Text variant="caption" color={ink[500]}>Customers see this before they book and can claim within it.</Text>
      {claimed.map((r, i) => (
        <Pressable key={r.code} onPress={() => setPicking(r)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.row, i > 0 && styles.rule]}>
          <Text variant="bodySmall" color={ink[700]} numberOfLines={1} style={styles.flex}>{r.name}</Text>
          <View style={styles.value}>
            <Text variant="caption" weight="semibold">{label(warrantyOf(rows, r.code, r.warrantyDays))}</Text>
            <ChevronDown size={14} color={ink[400]} />
          </View>
        </Pressable>
      ))}
      {picking ? (
        <BottomSheet visible onClose={() => setPicking(null)} title={picking.name}>
          <View style={styles.list}>
            {[...new Set([...WARRANTY_CHOICES, current])].sort((a, b) => a - b).map((d) => (
              <Pressable key={d} onPress={() => { const code = picking.code; setPicking(null); change(code, d); }} android_ripple={RIPPLE}
                accessibilityRole="radio" accessibilityState={{ selected: d === current }} style={[styles.option, d === current && styles.optionOn]}>
                <Text variant="body" weight={d === current ? 'bold' : 'medium'} color={d === current ? zappy[700] : ink[900]}>{label(d)}</Text>
              </Pressable>
            ))}
          </View>
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.base, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  rule: { borderTopWidth: 1, borderTopColor: slate[100] },
  flex: { flex: 1, minWidth: 0 },
  value: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200], paddingHorizontal: 8, paddingVertical: 4 },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.base, gap: 4 },
  option: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.medium },
  optionOn: { backgroundColor: zappy[50] },
});
