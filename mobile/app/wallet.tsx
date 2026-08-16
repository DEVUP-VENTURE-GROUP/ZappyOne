/**
 * Wallet.
 * ----------------------------------------------------------------------------
 * Balance, top-up, and the transaction ledger.
 *
 * Both of the numbers on this screen were previously unreachable: `GET /wallet`
 * wraps its payload in `{ wallet: … }` and the client had no transform, and the
 * transaction list lives under `items` while the client read `transactions`.
 * Both are fixed in `walletApi` — see the notes there.
 *
 * Amounts are stored in PAISE server-side and converted for display only. The
 * top-up sheet sends paise, so the presets are defined in rupees and multiplied
 * once, at the call.
 *
 * `isFrozen` and `dues` are real fields the wallet can carry. When the wallet
 * is frozen, top-up is disabled rather than hidden — a control that vanishes
 * without explanation reads as a bug.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  Plus,
  ReceiptText,
} from 'lucide-react-native';
import {
  Appear,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Gradient,
  ScreenHeader,
  SectionTitle,
  Skeleton,
  Text,
  formatRupees,
} from '../components/ui';
import {
  useGetWalletQuery,
  useWalletTopupMutation,
  useWalletTransactionsQuery,
} from '../services/api/walletApi';
import { getApiErrorMessage } from '../services/api/apiSlice';
import {
  openCashfreeCheckout,
  parseReturnUrl,
  paymentReturnUrl,
} from '../services/payments/cashfreeCheckout';
import { useVerifyPaymentMutation } from '../services/api/paymentsApi';
import { colors, navy, zappy } from '../theme/colors';
import { radius } from '../theme/radius';
import { screenPadding, spacing } from '../theme/spacing';
import type { WalletTransaction } from '../types/api';

/** Top-up presets, in rupees. Converted to paise at the call site. */
const PRESETS = [100, 250, 500, 1000];

function formatWhen(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const isCredit = tx.type === 'credit';
  const tone = isCredit ? colors.successDark : colors.textHeading;

  return (
    <View style={styles.txRow}>
      <View
        style={[
          styles.txIcon,
          { backgroundColor: isCredit ? colors.successTint : colors.surfaceTertiary },
        ]}
      >
        {isCredit ? (
          <ArrowDownLeft size={16} color={colors.successDark} />
        ) : (
          <ArrowUpRight size={16} color={colors.textSecondary} />
        )}
      </View>

      <View style={styles.flex}>
        <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
          {tx.description || tx.reason || (isCredit ? 'Money added' : 'Payment')}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {formatWhen(tx.createdAt)}
        </Text>
      </View>

      <View style={styles.txAmount}>
        <Text variant="bodySmall" weight="semibold" color={tone}>
          {isCredit ? '+' : '−'}
          {formatRupees(tx.amountPaise / 100)}
        </Text>
        {typeof tx.balanceAfterPaise === 'number' ? (
          <Text variant="caption" color={colors.textMuted}>
            {formatRupees(tx.balanceAfterPaise / 100)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    data: wallet,
    isLoading: walletLoading,
    error: walletError,
    refetch: refetchWallet,
  } = useGetWalletQuery();
  const {
    data: transactions = [],
    isLoading: txLoading,
    isFetching,
    refetch: refetchTx,
  } = useWalletTransactionsQuery();
  const [topup, { isLoading: startingTopup }] = useWalletTopupMutation();
  const [verifyPayment] = useVerifyPaymentMutation();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [amount, setAmount] = useState(PRESETS[1]);
  const [topupError, setTopupError] = useState<string | null>(null);

  const frozen = wallet?.isFrozen === true;

  const startTopup = useCallback(async () => {
    setTopupError(null);
    try {
      const order = await topup({
        amountPaise: amount * 100,
        returnUrl: paymentReturnUrl(),
      }).unwrap();

      const outcome = await openCashfreeCheckout(order.paymentSessionId, order.cashfreeEnv);
      if (outcome.kind === 'returned') {
        const { cfOrderId, cfPaymentId } = parseReturnUrl(outcome.url);
        if (cfOrderId && cfPaymentId) {
          // Non-fatal: the webhook settles the credit server-side regardless.
          await verifyPayment({ cfOrderId, cfPaymentId }).unwrap().catch(() => {});
        }
      }
      setSheetOpen(false);
      refetchWallet();
      refetchTx();
    } catch (err) {
      setTopupError(getApiErrorMessage(err, "We couldn't start that top-up."));
    }
  }, [amount, topup, verifyPayment, refetchWallet, refetchTx]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Zappy Wallet" onBack={() => router.back()} />
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <TransactionRow tx={item} />}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        ItemSeparatorComponent={() => <View style={styles.txSeparator} />}
        refreshing={isFetching && !txLoading}
        onRefresh={() => {
          refetchWallet();
          refetchTx();
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* ── Balance ─────────────────────────────────────────────── */}
            {walletLoading ? (
              <Skeleton width="100%" height={140} borderRadius={radius.large} />
            ) : walletError ? (
              <ErrorState
                message={getApiErrorMessage(walletError, "We couldn't load your wallet.")}
                onRetry={refetchWallet}
              />
            ) : (
              <Appear>
                <Gradient colors={[zappy[600], navy[900]]} style={styles.balanceCard}>
                  <Text variant="label" color="rgba(255,255,255,0.75)">
                    AVAILABLE BALANCE
                  </Text>
                  <Text variant="display" color={colors.textInverse} style={styles.balance}>
                    {formatRupees((wallet?.balancePaise ?? 0) / 100)}
                  </Text>

                  {frozen ? (
                    <View style={styles.frozenRow}>
                      <Lock size={13} color={colors.textInverse} />
                      <Text variant="caption" color="rgba(255,255,255,0.9)">
                        This wallet is frozen. Contact support to unlock it.
                      </Text>
                    </View>
                  ) : (
                    <Button
                      label="Add money"
                      variant="secondary"
                      size="small"
                      icon={<Plus size={15} color={colors.primary} />}
                      onPress={() => setSheetOpen(true)}
                      style={styles.addButton}
                    />
                  )}
                </Gradient>
              </Appear>
            )}

            {/* Dues are only present when the account owes something. */}
            {wallet?.dues?.amountPaise ? (
              <Card variant="outline" style={styles.duesCard}>
                <Text variant="bodySmall" weight="semibold" color={colors.accentDark}>
                  {formatRupees(wallet.dues.amountPaise / 100)} outstanding
                </Text>
                {wallet.dues.reason ? (
                  <Text variant="caption" color={colors.textSecondary}>
                    {wallet.dues.reason}
                  </Text>
                ) : null}
              </Card>
            ) : null}

            <SectionTitle style={styles.historyTitle}>Transactions</SectionTitle>
          </View>
        }
        ListEmptyComponent={
          txLoading ? (
            <View style={styles.skeletons}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.txRow}>
                  <Skeleton width={36} height={36} borderRadius={radius.small} />
                  <View style={styles.flex}>
                    <Skeleton width="55%" height={13} />
                    <Skeleton width="30%" height={10} style={{ marginTop: spacing.xs }} />
                  </View>
                  <Skeleton width={60} height={13} />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              icon={<ReceiptText size={26} color={colors.textMuted} />}
              title="No transactions yet"
              message="Money you add, and payments made from your wallet, will show up here."
            />
          )
        }
      />

      {/* ── Top-up ───────────────────────────────────────────────────────── */}
      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Add money">
        <Text variant="bodySmall" color={colors.textSecondary}>
          Choose an amount. You&apos;ll pay through Zappy&apos;s secure checkout.
        </Text>

        <View style={styles.presetRow}>
          {PRESETS.map((value) => (
            <Chip
              key={value}
              label={formatRupees(value)}
              selected={amount === value}
              tone={amount === value ? 'blue' : 'neutral'}
              onPress={() => setAmount(value)}
            />
          ))}
        </View>

        {topupError ? (
          <Text variant="caption" color={colors.error} style={styles.topupError}>
            {topupError}
          </Text>
        ) : null}

        <Button
          label={`Add ${formatRupees(amount)}`}
          onPress={startTopup}
          loading={startingTopup}
          fullWidth
          style={styles.sheetPrimary}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  list: { paddingHorizontal: screenPadding, flexGrow: 1 },
  headerBlock: { gap: spacing.base, paddingBottom: spacing.sm },

  balanceCard: { padding: spacing.lg, borderRadius: radius.large, gap: spacing.xxs },
  balance: { letterSpacing: -1 },
  addButton: { alignSelf: 'flex-start', marginTop: spacing.base },
  frozenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.base,
  },

  duesCard: { backgroundColor: colors.warningTint, borderColor: colors.warningTint },
  historyTitle: { marginTop: spacing.sm },

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txAmount: { alignItems: 'flex-end' },
  txSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },

  skeletons: { gap: spacing.sm },

  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  topupError: { marginTop: spacing.sm },
  sheetPrimary: { marginTop: spacing.lg },
});
