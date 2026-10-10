/**
 * One repair on a price sheet. Collapsed it shows what is live (and what is in
 * review); open, a box per part grade, because the grade is what the customer
 * is really buying. No Zappy band is shown: it would anchor every shop to the
 * same number.
 */
import { memo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ChevronRight, X } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '../../../components';
import { accent, colors, ink, slate, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { cellKey, tiersFor, type ClaimedRepair, type PriceRowData } from './priceSheet';

export const PriceRow = memo(function PriceRow({ repair, values, existing, onChange, onRemove }: {
  repair: ClaimedRepair; values: Record<string, string>; existing: Map<string, PriceRowData>;
  onChange: (key: string, raw: string) => void; onRemove?: (r: ClaimedRepair) => void;
}) {
  const [open, setOpen] = useState(false);
  const tiers = tiersFor(repair);
  const live = tiers.map((t) => existing.get(cellKey(repair.code, t.code))).filter(Boolean) as PriceRowData[];
  const typed = tiers.filter((t) => values[cellKey(repair.code, t.code)]).length;

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={[styles.head, onRemove && styles.headPad]}>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="semibold">{repair.name}</Text>
          {live.length ? (
            <View style={styles.wrap}>
              {live.map((row) => (
                <View key={row._id} style={styles.price}>
                  <Text variant="caption" weight="black">{formatPaise(row.totalPaise)}</Text>
                  {row.qualityCode ? <Text variant="caption" weight="semibold" color={ink[400]}>{row.qualityCode.toUpperCase()}</Text> : null}
                  {!['approved', 'auto_approved'].includes(row.approvalStatus || '') ? (
                    <View style={styles.review}><Text variant="caption" weight="bold" color={accent[700]}>{row.approvalStatus === 'rejected' ? 'rejected' : 'in review'}</Text></View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : typed ? <Text variant="caption" weight="semibold" color={zappy[600]}>{typed} price{typed === 1 ? '' : 's'} typed, not saved yet</Text>
            : <Text variant="caption" weight="semibold" color={accent[600]}>No price yet</Text>}
        </View>
        <ChevronRight size={16} color={slate[300]} style={open ? styles.turned : undefined} />
      </Pressable>
      {onRemove ? (
        <Pressable onPress={() => onRemove(repair)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Stop offering ${repair.name}`} style={styles.remove}>
          <X size={16} color={ink[400]} />
        </Pressable>
      ) : null}
      {open ? (
        <View style={styles.body}>
          {repair.usesPart ? (
            <Text variant="caption" color={ink[500]}>Quote the <Text variant="caption" weight="bold">final price</Text> the customer pays, part included. Fill only the grades you actually fit.</Text>
          ) : null}
          {tiers.map((t) => {
            const k = cellKey(repair.code, t.code);
            const row = existing.get(k);
            return (
              <View key={t.code || 'flat'} style={styles.tier}>
                <View style={styles.tierLabel}>
                  <Text variant="caption" weight="bold" color={ink[700]}>{t.label}</Text>
                  {t.hint ? <Text variant="caption" color={ink[400]}>{t.hint}</Text> : null}
                </View>
                <View style={styles.amount}>
                  <Text variant="bodySmall" color={ink[400]}>₹</Text>
                  <TextInput value={values[k] ?? ''} onChangeText={(v) => onChange(k, v.replace(/[^\d]/g, ''))} keyboardType="number-pad"
                    placeholder={row ? String(Math.round(row.totalPaise / 100)) : 'Not offered'} placeholderTextColor={ink[400]}
                    accessibilityLabel={`${repair.name}, ${t.label}, price in rupees`} style={styles.input} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  headPad: { paddingRight: 44 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  review: { borderRadius: radius.pill, backgroundColor: accent[50], paddingHorizontal: 6 },
  turned: { transform: [{ rotate: '90deg' }] },
  remove: { position: 'absolute', top: 6, right: 6, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body: { borderTopWidth: 1, borderTopColor: slate[100], padding: spacing.md, gap: spacing.sm },
  tier: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tierLabel: { width: 112 },
  amount: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  input: { flex: 1, fontSize: 15, fontFamily: 'Figtree-SemiBold', color: ink[900] },
});
