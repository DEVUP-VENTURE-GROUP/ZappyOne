/**
 * Any link the app has no screen for (an older notification, a server link to
 * something new): a calm way back, never an error.
 */
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { Button, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export default function NotFound() {
  const router = useRouter();
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.page}>
        <View style={styles.icon}><Sparkles size={28} color={zappy[600]} /></View>
        <Text variant="heading3" weight="bold" style={styles.center}>{t('soon.title', 'Coming to the app soon')}</Text>
        <Text variant="bodySmall" color={ink[500]} style={styles.center}>{t('soon.body', 'This part of ZappyOne is on its way to the app. Everything else is ready to use.')}</Text>
        <Button label={t('soon.home', 'Go to home')} onPress={() => router.replace('/' as never)} fullWidth />
        {router.canGoBack() ? <Button label={t('common.back', 'Back')} variant="ghost" onPress={() => router.back()} fullWidth /> : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  icon: { width: 64, height: 64, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  center: { textAlign: 'center' },
});
