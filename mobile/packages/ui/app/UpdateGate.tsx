/**
 * An app older than the minimum set in Admin → System → App versions shows
 * "update to continue" instead of running. Anything else (the check failing,
 * no minimum set, no network) lets the app through: the gate never locks
 * anyone out by mistake.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { Download } from 'lucide-react-native';
import { useAppReleaseQuery } from '@zappy/core/api';
import { APP_ID } from '@zappy/core/config/env';
import { APP_PACKAGES, isOlder } from '@zappy/core/shared/appVersion';
import { Button, Text } from '../components';
import { useT } from '../lib/i18n';
import { openLink } from '../lib/openLink';
import { colors, ink, zappy } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

export function UpdateGate({ children }: { children: ReactNode }) {
  const t = useT();
  const { data } = useAppReleaseQuery(APP_ID);
  const version = Constants.expoConfig?.version || '0.0.0';
  if (!data?.minVersion || !isOlder(version, data.minVersion)) return <>{children}</>;

  const pkg = APP_PACKAGES[APP_ID as keyof typeof APP_PACKAGES];
  return (
    <View style={styles.page}>
      <View style={styles.icon}><Download size={30} color={zappy[600]} /></View>
      <Text variant="heading2" weight="bold" style={styles.center}>{t('update.title', 'Update to continue')}</Text>
      <Text variant="bodySmall" color={ink[500]} style={styles.center}>
        {data.message || t('update.body', 'This version of the app is no longer supported. Update to the latest version to keep booking and tracking your jobs.')}
      </Text>
      <Text variant="caption" color={ink[400]}>{t('update.yours', 'Your version')} {version} · {t('update.needed', 'needed')} {data.minVersion}</Text>
      <Button label={t('update.cta', 'Update now')} icon={<Download size={16} color="#fff" />} fullWidth
        onPress={() => openLink(`market://details?id=${pkg}`, 'Open the Play Store and update ZappyOne.')} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  icon: { width: 72, height: 72, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  center: { textAlign: 'center' },
});
