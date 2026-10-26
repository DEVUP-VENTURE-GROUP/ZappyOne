/** Commission this business owes ZappyOne from cash jobs (the website's PartnerDuesCard); hidden when nothing is owed. */
import { StyleSheet, View } from 'react-native';
import { AlertTriangle, Wallet } from 'lucide-react-native';
import { useShopDuesQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { colors, danger, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Dues { duesPaise: number; limitPaise: number; warnPaise: number; isBlocked: boolean; payInstructions: string }

export function PartnerDuesCard() {
  const { data } = useShopDuesQuery(undefined, { pollingInterval: 120000 });
  const d = data as Dues | undefined;
  if (!d || d.duesPaise <= 0) return null;
  const near = !d.isBlocked && d.duesPaise >= d.warnPaise;
  return (
    <View style={[styles.card, d.isBlocked ? styles.stopped : near ? styles.near : null]}>
      <View style={styles.head}>
        {d.isBlocked ? <AlertTriangle size={18} color={danger[600]} /> : <Wallet size={18} color={ink[500]} />}
        <Text variant="body" weight="bold">You owe ZappyOne {formatPaise(d.duesPaise)}</Text>
      </View>
      <Text variant="caption" color={ink[500]}>
        {d.isBlocked ? `New jobs are paused until it is under ${formatPaise(d.limitPaise)}.` : `Commission from cash jobs. New jobs pause at ${formatPaise(d.limitPaise)}.`} Online jobs pay it down by themselves.
      </Text>
      {d.payInstructions ? <View style={styles.pay}><Text variant="caption" weight="semibold">{d.payInstructions}</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stopped: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  near: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pay: { marginTop: spacing.xs, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: 'rgba(255,255,255,0.7)' },
});
