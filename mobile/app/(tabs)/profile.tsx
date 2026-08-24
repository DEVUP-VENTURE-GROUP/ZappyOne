/**
 * Profile — the account hub.
 * ----------------------------------------------------------------------------
 * Every row here leads somewhere that exists. The sections map 1:1 to live
 * endpoints, checked against the running API rather than assumed:
 *
 *   Profile          GET/PATCH /users/me
 *   Addresses        /users/addresses
 *   Payment methods  /users/payment-methods
 *   Wallet           /wallet
 *   Rewards          /rewards  ·  /gamification
 *   Notifications    /notifications
 *   Support          /content/faqs
 *   Policies         /content/policies
 *   Sign out         POST /auth/logout
 *
 * Rows carry live values where the API gives one — the wallet balance, the
 * unread notification count, the saved-address count. A row whose data hasn't
 * loaded shows no detail line rather than a zero, because "₹0" and "not loaded
 * yet" are different statements.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  CreditCard,
  Gift,
  LifeBuoy,
  LogOut,
  MapPin,
  Pencil,
  ScrollText,
  Star,
  Wallet as WalletIcon,
} from 'lucide-react-native';
import {
  Appear,
  BottomSheet,
  Button,
  Card,
  IconButton,
  Text,
  ZappyLogo,
  formatRupees,
} from '../../components/ui';
import {
  AccountRow,
  AccountSection,
  ProfileHeader,
} from '../../components/account/AccountUI';
import {
  useGetAddressesQuery,
  useGetMeQuery,
  useLogoutMutation,
} from '../../services/api/authApi';
import { useGetWalletQuery } from '../../services/api/walletApi';
import { useGetRewardsQuery } from '../../services/api/rewardsApi';
import { useListNotificationsQuery } from '../../services/api/notificationsApi';
import { getRefreshToken, clearSession } from '../../services/api/tokenStorage';
import { useAppDispatch } from '../../store/hooks';
import { logout as logoutAction } from '../../store/authSlice';
import { apiSlice } from '../../services/api/apiSlice';
import { colors, accent, success } from '../../theme/colors';
import { spacing, screenPadding, bottomNavClearance } from '../../theme/spacing';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const { data: me } = useGetMeQuery();
  const { data: savedLocations } = useGetAddressesQuery();
  const { data: wallet } = useGetWalletQuery();
  const { data: rewards } = useGetRewardsQuery();
  const { data: notifications } = useListNotificationsQuery();

  const addressCount = savedLocations?.addresses.length;
  const unread = notifications?.unread;

  const [logoutMutation] = useLogoutMutation();

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        // Best effort — a failed revoke must not trap the customer in a
        // session they've asked to end.
        await logoutMutation({ refreshToken }).unwrap().catch(() => {});
      }
    } finally {
      await clearSession();
      dispatch(logoutAction());
      // Without this the next account inherits this one's cached orders,
      // wallet and addresses until each query happens to refetch.
      dispatch(apiSlice.util.resetApiState());
      setSigningOut(false);
      router.replace('/(auth)/login');
    }
  }, [dispatch, router, logoutMutation]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomNavClearance + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <Appear>
          <Card variant="outline" style={styles.headerCard}>
            <ProfileHeader
              name={me?.name}
              phone={me?.phone}
              avatarUrl={me?.avatarUrl}
              verified
              right={
                <IconButton
                  icon={<Pencil size={16} color={colors.primary} />}
                  // `as never`: typed-routes stale-cache artifact — route is real (app/account/edit.tsx).
                  onPress={() => router.push('/account/edit' as never)}
                  variant="surface"
                  accessibilityLabel="Edit your profile"
                />
              }
            />
          </Card>
        </Appear>

        {/* ── Money ────────────────────────────────────────────────────── */}
        <Appear delay={40}>
          <AccountSection title="Payments">
            <AccountRow
              icon={<WalletIcon size={17} color={colors.primary} />}
              label="Zappy Wallet"
              // No detail until it loads — "₹0" would be a claim, not a blank.
              detail={
                wallet ? `Balance ${formatRupees(wallet.balancePaise / 100)}` : undefined
              }
              onPress={() => router.push('/wallet')}
            />
            <AccountRow
              icon={<CreditCard size={17} color={colors.primary} />}
              label="Payment methods"
              onPress={() => router.push('/payment-methods')}
            />
            <AccountRow
              icon={<Gift size={17} color={accent[600]} />}
              tint={colors.accentTint}
              label="Rewards"
              detail={
                rewards
                  ? `${rewards.points.toLocaleString('en-IN')} points`
                  : undefined
              }
              onPress={() => router.push('/rewards')}
            />
          </AccountSection>
        </Appear>

        {/* ── Account ──────────────────────────────────────────────────── */}
        <Appear delay={80}>
          <AccountSection title="Account">
            <AccountRow
              icon={<MapPin size={17} color={colors.primary} />}
              label="Saved addresses"
              detail={
                typeof addressCount === 'number'
                  ? `${addressCount} saved`
                  : undefined
              }
              onPress={() => router.push('/addresses')}
            />
            <AccountRow
              icon={<Bell size={17} color={colors.primary} />}
              label="Notifications"
              right={
                unread && unread > 0 ? (
                  <View style={styles.badge}>
                    <Text variant="caption" color={colors.textInverse}>
                      {unread > 99 ? '99+' : unread}
                    </Text>
                  </View>
                ) : undefined
              }
              onPress={() => router.push('/notifications')}
            />
          </AccountSection>
        </Appear>

        {/* ── Help ─────────────────────────────────────────────────────── */}
        <Appear delay={120}>
          <AccountSection title="Help & legal">
            <AccountRow
              icon={<LifeBuoy size={17} color={success[600]} />}
              tint={colors.successTint}
              label="Help & support"
              onPress={() => router.push('/support')}
            />
            <AccountRow
              icon={<ScrollText size={17} color={colors.textSecondary} />}
              tint={colors.surfaceTertiary}
              label="Policies"
              onPress={() => router.push('/policies')}
            />
          </AccountSection>
        </Appear>

        {/* ── Sign out ─────────────────────────────────────────────────── */}
        <Appear delay={160}>
          <AccountSection>
            <AccountRow
              icon={<LogOut size={17} color={colors.error} />}
              tint={colors.errorTint}
              label="Sign out"
              destructive
              right={<View />}
              onPress={() => setSignOutOpen(true)}
            />
          </AccountSection>
        </Appear>

        {/* ── Brand mark ───────────────────────────────────────────────── */}
        <View style={styles.brand}>
          <ZappyLogo size={22} />
          {me?.rating != null ? (
            <View style={styles.ratingRow}>
              <Star size={12} color={colors.accent} fill={colors.accent} />
              <Text variant="caption" color={colors.textMuted}>
                Your rating {me.rating.toFixed(1)}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <BottomSheet
        visible={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title="Sign out?"
      >
        <Text variant="bodySmall" color={colors.textSecondary}>
          You&apos;ll need your phone number to sign back in. Your bookings and
          saved addresses stay on your account.
        </Text>
        <Button
          label="Sign out"
          variant="danger"
          onPress={() => {
            setSignOutOpen(false);
            signOut();
          }}
          loading={signingOut}
          fullWidth
          style={styles.sheetPrimary}
        />
        <Button
          label="Stay signed in"
          variant="secondary"
          onPress={() => setSignOutOpen(false)}
          fullWidth
          style={styles.sheetSecondary}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: screenPadding, gap: spacing.lg },

  headerCard: { paddingVertical: spacing.lg },

  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brand: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.lg },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },

  sheetPrimary: { marginTop: spacing.lg },
  sheetSecondary: { marginTop: spacing.sm },
});
