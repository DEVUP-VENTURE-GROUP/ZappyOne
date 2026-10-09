/**
 * The first screens of each app, before its real flows are built: who is
 * signed in, what the app is for, and sign out. Real data only — nothing on
 * these screens is made up. Each app replaces them as its flows land.
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAppSelector } from '@zappy/core/store/hooks';
import { useSignOut } from '@zappy/core/hooks/useSignOut';
import { Button, Card, ScreenHeader, Text } from '../components';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

const ROLE_LABEL: Record<string, string> = {
  user: 'Customer',
  worker: 'Professional',
  shop: 'Shop owner',
  event_partner: 'Event partner',
  admin: 'Admin',
};

export function HomeStart({ appName, tagline }: { appName: string; tagline: string }) {
  const user = useAppSelector((s) => s.auth.user);
  const firstName = user?.name?.split(' ')[0];
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.body}>
      <ScreenHeader title={firstName ? `Hello, ${firstName}` : appName} subtitle={appName} safeArea />
      <Card padding={spacing.lg}>
        <Text variant="sectionHeading">{tagline}</Text>
        <Text variant="bodySmall" color={colors.textSecondary} style={styles.gap}>
          You are signed in. The rest of this app is being built screen by screen on this foundation.
        </Text>
      </Card>
    </ScrollView>
  );
}

export function AccountStart({ appName }: { appName: string }) {
  const user = useAppSelector((s) => s.auth.user);
  const role = useAppSelector((s) => s.auth.role);
  const signOut = useSignOut();
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.body}>
      <ScreenHeader title="Account" subtitle={appName} safeArea />
      <Card padding={spacing.lg}>
        {user?.name ? <Text variant="sectionHeading">{user.name}</Text> : null}
        {user?.phone ? <Text variant="bodySmall" color={colors.textSecondary}>+91 {user.phone}</Text> : null}
        <View style={styles.gap}>
          <Text variant="caption" color={colors.textMuted}>Signed in as {ROLE_LABEL[role ?? ''] ?? 'a ZappyOne account'}</Text>
        </View>
      </Card>
      <Button label="Sign out" variant="outline" onPress={signOut} fullWidth />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.base, gap: spacing.base },
  gap: { marginTop: spacing.sm },
});
