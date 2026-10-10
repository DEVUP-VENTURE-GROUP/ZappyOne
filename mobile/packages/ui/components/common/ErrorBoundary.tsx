/**
 * What a screen shows if it crashes (the websites' ErrorBoundary). Never an
 * error page: a calm moment that retries the screen by itself, and a quiet way
 * home only if it still cannot be shown. Each crash is reported to Admin →
 * Live errors so the cause gets fixed.
 *
 * Expo Router renders it in place of the crashed route when a layout exports
 * it: `export { ErrorBoundary } from '@zappy/ui/components/common/ErrorBoundary'`.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { reportError } from '@zappy/core/lib/errorReporter';
import { Text } from '..';
import { colors, danger, ink, zappy } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

const MAX_TRIES = 3;
const RETRY_MS = 2500;
// Survives the boundary remounting on each retry, so retries stop after a few.
let tries = 0;
let triesAt = 0;

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const router = useRouter();
  const path = usePathname();
  const [, force] = useState(0);
  const reported = useRef(false);

  if (Date.now() - triesAt > 60000) tries = 0;   // a fresh crash later starts over
  const exhausted = tries >= MAX_TRIES;

  useEffect(() => {
    if (!reported.current) { reported.current = true; reportError({ kind: 'crash', message: error?.message || String(error), stack: error?.stack, path, healed: !exhausted }); }
    if (exhausted) return undefined;
    const t = setTimeout(() => { tries += 1; triesAt = Date.now(); retry().catch(() => force((n) => n + 1)); }, RETRY_MS);
    return () => clearTimeout(t);
  }, [error, retry, path, exhausted]);

  return (
    <View style={styles.page}>
      <ActivityIndicator size="large" color={zappy[600]} />
      <Text variant="bodySmall" weight="semibold" color={ink[700]}>Just a moment…</Text>
      {exhausted ? (
        <Pressable onPress={() => { tries = 0; router.replace('/'); }} hitSlop={8} accessibilityRole="button">
          <Text variant="bodySmall" weight="semibold" color={zappy[600]}>Continue to home</Text>
        </Pressable>
      ) : null}
      {/* Development only: the actual error, so it is fixable at a glance. */}
      {__DEV__ ? (
        <ScrollView style={styles.dev}><Text variant="caption" color={danger[600]}>{String(error?.message || error)}{error?.stack ? `\n\n${error.stack}` : ''}</Text></ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.background },
  dev: { maxHeight: 240, alignSelf: 'stretch', marginTop: spacing.lg, padding: spacing.md, borderRadius: 12, backgroundColor: danger[50] },
});
