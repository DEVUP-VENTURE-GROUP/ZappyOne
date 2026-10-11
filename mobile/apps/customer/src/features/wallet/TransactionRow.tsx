/** One wallet movement (the website's transaction row): what it was, when, and the amount; rewards are marked. */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, Crown, Gift, Percent, Receipt, RefreshCw, Star, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, danger, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Txn { _id: string; amountPaise: number; reason?: string; createdAt: string }

const META: Record<string, [LucideIcon, string, string, string]> = {
  cashback: [Gift, '#FDF4FF', '#C026D3', 'Cashback Reward'],
  referral_reward: [Gift, danger[50], danger[600], 'Referral Bonus'],
  admin_adjustment_credit: [Crown, accent[50], accent[600], 'Bonus Credit'],
  admin_adjustment_debit: [Receipt, slate[50], ink[500], 'Adjustment Debit'],
  wallet_topup: [ArrowDownToLine, success[50], success[600], 'Top-up Added'],
  withdrawal: [ArrowUpFromLine, zappy[50], zappy[600], 'Withdrawal'],
  refund: [RefreshCw, '#F0F9FF', '#0284C7', 'Refund'],
  worker_earning: [TrendingUp, success[50], success[600], 'Job Earnings'],
  platform_commission: [Percent, slate[50], ink[500], 'Platform Fee'],
  cancellation_fee: [AlertCircle, danger[50], danger[600], 'Cancel Fee'],
  subscription_revenue: [Star, accent[50], accent[600], 'Subscription'],
};
const REWARDS = new Set(['cashback', 'referral_reward', 'admin_adjustment_credit']);

export const TransactionRow = memo(function TransactionRow({ txn }: { txn: Txn }) {
  const t = useT();
  const positive = txn.amountPaise > 0;
  const known = txn.reason ? META[txn.reason] : undefined;
  const [Icon, bg, fg, label] = known || [positive ? TrendingUp : TrendingDown, positive ? success[50] : slate[50], positive ? success[600] : ink[500], txn.reason?.replace(/_/g, ' ') || (positive ? 'Credit' : 'Debit')];
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: bg }]}><Icon size={20} color={fg} /></View>
      <View style={styles.flex}>
        <View style={styles.inline}>
          <Text variant="bodySmall" weight="black" numberOfLines={1} style={styles.cap}>{known ? t(`wallet.txn.${txn.reason}`, label) : label}</Text>
          {txn.reason && REWARDS.has(txn.reason) ? <View style={styles.reward}><Text variant="caption" weight="black" color="#fff">{t('wallet.reward', 'REWARD')}</Text></View> : null}
        </View>
        <Text variant="caption" weight="bold" color={ink[400]}>{new Date(txn.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      <Text variant="body" weight="black" color={positive ? success[600] : ink[700]}>{positive ? '+' : '−'}₹{(Math.abs(txn.amountPaise) / 100).toLocaleString('en-IN')}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.base, borderTopWidth: 1, borderTopColor: colors.border },
  icon: { width: 48, height: 48, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cap: { flexShrink: 1, textTransform: 'capitalize' },
  reward: { borderRadius: radius.small, paddingHorizontal: 6, backgroundColor: '#D946EF' },
});
