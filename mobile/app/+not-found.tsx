/**
 * 404 — a route that does not exist.
 * ----------------------------------------------------------------------------
 * Reachable from a stale deep link or a push notification pointing at a screen
 * this build does not have, so it offers a way back rather than a dead end.
 *
 * Previously rendered through the Expo starter's `Themed` components, which
 * carried their own palette (`#2f95dc`) and light/dark switching that nothing
 * else in the app uses. It is now on the design system like every other screen.
 * ----------------------------------------------------------------------------
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Compass } from 'lucide-react-native';
import { EmptyState } from '../components/ui';
import { colors } from '../theme/colors';
import { screenPadding } from '../theme/spacing';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <EmptyState
        icon={<Compass size={28} color={colors.textMuted} />}
        title="This page doesn't exist"
        message="The link you followed may be broken, or the page may have moved."
        actionLabel="Go home"
        onAction={() => router.replace('/(tabs)/home')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: screenPadding,
    backgroundColor: colors.background,
  },
});
