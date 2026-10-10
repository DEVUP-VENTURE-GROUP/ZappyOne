/**
 * Prices, for an individual provider: customers pay the ZappyOne standard price
 * for their work, so this shows what each job pays rather than a sheet to fill.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRepairWorkCatalogQuery, useRepairProviderSuggestedPricingQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { LoadingState, Text } from '../../../components';
import { colors, ink, slate } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { StepShell } from './StepShell';
import type { RepairGroup } from './workSelection';

export function StandardPricesStep({ vertical, onBack, onNext }: { vertical: string; onBack: () => void; onNext: () => void }) {
  const { data: work } = useRepairWorkCatalogQuery({ vertical });
  const { data, isLoading } = useRepairProviderSuggestedPricingQuery({ vertical });

  // The lowest standard price per job ("from"), sorted by the job's name.
  const rows = useMemo(() => {
    const names = new Map(((work?.groups || []) as RepairGroup[]).flatMap((g) => g.repairs).map((r) => [r.code, r.name]));
    const best = new Map<string, number>();
    for (const s of (data?.suggestions || []) as { repairCode: string; totalPaise: number }[]) {
      const cur = best.get(s.repairCode);
      if (cur === undefined || s.totalPaise < cur) best.set(s.repairCode, s.totalPaise);
    }
    return [...best.entries()].map(([code, paise]) => ({ code, paise, name: names.get(code) || code })).sort((a, b) => a.name.localeCompare(b.name));
  }, [work, data]);

  return (
    <StepShell title="ZappyOne sets your prices" onBack={onBack} onNext={onNext} nextLabel="Finish"
      hint="Customers pay the ZappyOne standard price for your work, and you keep it after the 10% platform commission. Nothing to set here.">
      <View style={styles.card}>
        {isLoading ? <LoadingState /> : null}
        {!isLoading && !rows.length ? <Text variant="caption" color={ink[500]} style={styles.pad}>Standard prices for your work will show here as ZappyOne sets them.</Text> : null}
        {rows.map((r, i) => (
          <View key={r.code} style={[styles.row, i > 0 && styles.rule]}>
            <Text variant="bodySmall" color={ink[700]} style={styles.flex}>{r.name}</Text>
            <Text variant="bodySmall" weight="bold" style={styles.num}>from {formatPaise(r.paise)}</Text>
          </View>
        ))}
      </View>
    </StepShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  rule: { borderTopWidth: 1, borderTopColor: slate[100] },
  pad: { padding: spacing.base },
  flex: { flex: 1, minWidth: 0 },
  num: { fontVariant: ['tabular-nums'] },
});
