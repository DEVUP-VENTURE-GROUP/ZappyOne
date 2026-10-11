/** The items on a helping task: each one's state and what it cost (or its ceiling), and how the item money is settled. */
import { StyleSheet, View } from 'react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface TaskItem { _id: string; name: string; quantity: number; status: string; actualPricePaise?: number | null; maxApprovedPricePaise: number }

const ITEM_LABEL: Record<string, string> = {
  requested: 'Requested', found: 'Found', not_found: 'Not found', out_of_stock: 'Out of stock', alternative_proposed: 'Alternative proposed',
  awaiting_approval: 'Waiting on you', approved: 'Approved', rejected: 'Declined', purchased: 'Purchased', skipped: 'Skipped',
};

export function TaskItemsCard({ items, itemsPending }: { items: TaskItem[]; itemsPending: boolean }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <View style={styles.card}>
      <Text variant="body" weight="bold">{t('helpTask.items', 'Items')}</Text>
      {items.map((it, i) => (
        <View key={it._id} style={[styles.row, i > 0 && styles.rule]}>
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="semibold" numberOfLines={1}>{it.name} × {it.quantity}</Text>
            <Text variant="caption" color={ink[500]}>{t(`helpItem.${it.status}`, ITEM_LABEL[it.status] || it.status)}</Text>
          </View>
          <Text variant="bodySmall" weight="semibold">{it.actualPricePaise != null ? formatPaise(it.actualPricePaise) : `up to ${formatPaise(it.maxApprovedPricePaise)}`}</Text>
        </View>
      ))}
      {itemsPending ? <Text variant="caption" color={ink[500]}>{t('helpTask.repay', 'You repay what the helper spends, against the receipt, at delivery.')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  rule: { borderTopWidth: 1, borderTopColor: colors.border },
  flex: { flex: 1, minWidth: 0 },
});
