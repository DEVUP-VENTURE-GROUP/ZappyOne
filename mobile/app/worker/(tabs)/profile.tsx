/**
 * Worker profile.
 * ----------------------------------------------------------------------------
 * The pro's own account: who they are, what they're approved to do, where
 * their verification stands, and the way out.
 *
 * KYC state is the one thing on this screen that gates income, so it gets a
 * full card rather than a status line, and it reuses the SAME labels as the
 * KYC screen itself — a pro should not read "Action needed" here and
 * "Rejected" one tap later.
 *
 * Signing out confirms in a BottomSheet, matching the customer app, and tears
 * down the socket before clearing the session: the connection is authenticated
 * with the token being discarded, so leaving it open would keep a dead
 * authenticated socket alive until the server times it out.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Briefcase,
  ChevronRight,
  LogOut,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Star,
} from 'lucide-react-native';
import {
  Appear,
  Avatar,
  BottomSheet,
  Button,
  Card,
  ErrorState,
  Heading,
  LoadingState,
  Text,
} from '../../../components/ui';
import { AccountRow, AccountSection } from '../../../components/account/AccountUI';
import { useGetWorkerMeQuery } from '../../../services/api/workerApi';
import { useLogoutMutation } from '../../../services/api/authApi';
import { getRefreshToken, clearSession } from '../../../services/api/tokenStorage';
import { socketClient } from '../../../services/socket/socketClient';
import { apiSlice } from '../../../services/api/apiSlice';
import { getApiErrorMessage } from '../../../services/api/apiSlice';
import { logout as logoutAction } from '../../../store/authSlice';
import { colors, accent, danger, slate, success } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { bottomNavClearance, screenPadding, spacing } from '../../../theme/spacing';
import type { KycStatus } from '../../../types/api';

/** Same wording the KYC screen uses, so the two never disagree. */
const KYC_BADGE: Record<KycStatus, { label: string; fg: string; bg: string }> = {
  approved: { label: "You're verified", fg: success[700], bg: colors.successTint },
  pending_review: { label: 'Under review', fg: accent[700], bg: colors.warningTint },
  rejected: { label: 'Action needed', fg: colors.errorDark, bg: colors.errorTint },
  not_submitted: { label: 'Not submitted', fg: slate[600], bg: colors.surfaceSecondary },
  suspended: { label: 'Verification locked', fg: colors.errorDark, bg: colors.errorTint },
};

export default function WorkerProfileScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const { data: worker, isLoading, error, refetch } = useGetWorkerMeQuery();
  const [logoutMutation] = useLogoutMutation();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        // Best effort — a failed revoke must not trap the pro in a session
        // they've asked to end.
        await logoutMutation({ refreshToken }).unwrap().catch(() => {});
      }
    } finally {
      await clearSession();
      socketClient.destroy();
      dispatch(apiSlice.util.resetApiState());
      dispatch(logoutAction());
      setSigningOut(false);
      router.replace('/worker/login' as never);
    }
  }, [dispatch, router, logoutMutation]);

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <LoadingState label="Loading your profile…" />
      </View>
    );
  }

  if (error || !worker) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ErrorState
          message={getApiErrorMessage(error, "We couldn't load your profile.")}
          onRetry={refetch}
        />
      </View>
    );
  }

  const kyc = KYC_BADGE[worker.kyc.status] ?? KYC_BADGE.not_submitted;
  const verified = worker.kyc.status === 'approved';

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomNavClearance + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Identity ─────────────────────────────────────────────────── */}
        <Appear>
          <Card variant="outline" style={styles.headerCard}>
            <Avatar name={worker.name} uri={worker.avatarUrl} size={72} />
            <Heading level={3} align="center" style={styles.name}>
              {worker.name}
            </Heading>
            <View style={styles.statRow}>
              <Star size={13} color={accent[500]} fill={accent[500]} />
              <Text variant="caption" color={colors.textSecondary}>
                {worker.rating.toFixed(1)} · {worker.completedJobs} job
                {worker.completedJobs === 1 ? '' : 's'} completed
              </Text>
            </View>
          </Card>
        </Appear>

        {/* ── Verification — the thing that gates earning ───────────────── */}
        <Appear delay={40}>
          <Card
            variant="outline"
            style={[styles.kycCard, { backgroundColor: kyc.bg, borderColor: kyc.bg }]}
            onPress={() => router.push('/worker/kyc')}
            accessibilityLabel={`Identity verification: ${kyc.label}`}
            accessibilityHint="Opens your verification documents"
          >
            <View style={styles.kycRow}>
              {verified ? (
                <ShieldCheck size={22} color={kyc.fg} />
              ) : (
                <ShieldAlert size={22} color={kyc.fg} />
              )}
              <View style={styles.flex}>
                <Text variant="caption" weight="bold" color={kyc.fg} style={styles.kycLabel}>
                  IDENTITY VERIFICATION
                </Text>
                <Text variant="bodySmall" weight="semibold" color={kyc.fg}>
                  {kyc.label}
                </Text>
              </View>
              <ChevronRight size={17} color={kyc.fg} />
            </View>
          </Card>
        </Appear>

        {/* ── Details straight from /workers/me ─────────────────────────── */}
        <Appear delay={80}>
          <AccountSection title="Your details">
            <AccountRow
              icon={<Phone size={17} color={colors.primary} />}
              label="Phone"
              detail={`+91 ${worker.phone}`}
              right={<View />}
            />
            <AccountRow
              icon={<Briefcase size={17} color={colors.primary} />}
              label="Skills"
              detail={
                worker.skills.length
                  ? worker.skills.map((s) => s.replace(/_/g, ' ')).join(', ')
                  : 'No skills set'
              }
              right={<View />}
            />
          </AccountSection>
        </Appear>

        {/* ── Sign out ─────────────────────────────────────────────────── */}
        <Appear delay={120}>
          <AccountSection>
            <AccountRow
              icon={<LogOut size={17} color={colors.error} />}
              tint={colors.errorTint}
              label="Log out"
              destructive
              right={<View />}
              onPress={() => setSignOutOpen(true)}
            />
          </AccountSection>
        </Appear>
      </ScrollView>

      <BottomSheet
        visible={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title="Log out?"
      >
        <Text variant="bodySmall" color={colors.textSecondary}>
          You&apos;ll stop receiving job offers until you log back in. Your
          earnings and verification stay on your account.
        </Text>
        <Button
          label="Log out"
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
          label="Stay logged in"
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
  flex: { flex: 1 },
  centered: { justifyContent: 'center', paddingHorizontal: screenPadding },
  scroll: { paddingHorizontal: screenPadding, gap: spacing.lg },

  headerCard: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  name: { marginTop: spacing.sm },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  kycCard: { paddingVertical: spacing.base },
  kycRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kycLabel: { marginBottom: 2, letterSpacing: 0.4 },

  sheetPrimary: { marginTop: spacing.lg },
  sheetSecondary: { marginTop: spacing.sm },
});
