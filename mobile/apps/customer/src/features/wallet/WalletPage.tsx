/**
 * The customer's wallet (the website's WalletPage): the balance, frozen or
 * not, refer-a-friend, and recent activity. Adding money is online-only, and
 * the apps take no online payments, so it is not offered here.
 */
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, ChevronRight, Gift, Receipt } from 'lucide-react-native';
import { useGetWalletQuery, useWalletTransactionsQuery } from '@zappy/core/api';
import { ScreenHeader, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, danger, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { TransactionRow, type Txn } from './TransactionRow';

export function WalletPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data: wallet, isError, isFetching, refetch } = useGetWalletQuery(undefined);
  const { data: txns, refetch: refetchTxns } = useWalletTransactionsQuery({ page: 1 });
  const items: Txn[] = txns?.items || [];
  const balance = (wallet?.wallet?.balancePaise || 0) / 100;
  const refresh = () => { refetch(); refetchTxns(); };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('wallet.title', 'Wallet')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refresh} tintColor={zappy[500]} />}>
        {isError ? (
          <Pressable onPress={refresh} accessibilityRole="button" style={styles.error}>
            <Text variant="caption" weight="semibold" color={danger[600]} style={styles.flex}>{t('wallet.refreshFailed', "Couldn't refresh your balance")}</Text>
            <Text variant="caption" weight="bold" color={danger[600]}>{t('wallet.retry', 'Retry')}</Text>
          </Pressable>
        ) : null}
        <View style={styles.card}>
          <Text variant="caption" weight="semibold" color={ink[500]}>{t('wallet.availableBalance', 'Available balance')}</Text>
          <Text variant="heading1" weight="bold">₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
          {wallet?.wallet?.isFrozen ? <View style={styles.frozen}><AlertCircle size={13} color={danger[600]} /><Text variant="caption" weight="semibold" color={danger[600]}>{t('wallet.frozen', 'Wallet frozen. Contact support.')}</Text></View> : null}
        </View>
        <Pressable onPress={() => router.push('/referral' as never)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.card, styles.row]}>
          <View style={styles.giftIcon}><Gift size={20} color={ink[700]} /></View>
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="semibold">{t('wallet.referTitle', 'Refer a friend, get ₹100')}</Text>
            <Text variant="caption" color={ink[500]}>{t('wallet.referLine', 'Paid to your wallet when they complete their first booking.')}</Text>
          </View>
          <ChevronRight size={18} color={ink[400]} />
        </Pressable>
        <View style={styles.list}>
          <View style={styles.listHead}>
            <Text variant="caption" weight="black" color={ink[400]}>{t('wallet.recentActivity', 'Recent Activity').toUpperCase()}</Text>
            {items.length ? <Text variant="caption" weight="bold" color={ink[500]}>{t('wallet.records', '{n} records').replace('{n}', String(items.length))}</Text> : null}
          </View>
          {!items.length ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Receipt size={24} color={slate[300]} /></View>
              <Text variant="bodySmall" weight="black" color={ink[700]}>{t('wallet.noTxns', 'No Transactions')}</Text>
              <Text variant="caption" color={ink[500]} style={styles.center}>{t('wallet.noTxnsHint', 'Your wallet activity, deposits, and withdrawals will appear here.')}</Text>
            </View>
          ) : items.map((x) => <TransactionRow key={x._id} txn={x} />)}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.base, padding: spacing.base },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, backgroundColor: danger[50] },
  card: { gap: 4, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  frozen: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, marginTop: spacing.sm, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: danger[50] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  giftIcon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  flex: { flex: 1, minWidth: 0 },
  list: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.base, backgroundColor: slate[50] },
  empty: { alignItems: 'center', gap: 4, paddingVertical: spacing.xxl, paddingHorizontal: spacing.base },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, backgroundColor: slate[50] },
  center: { textAlign: 'center' },
});
