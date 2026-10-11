/**
 * Account security (the website's AccountSecurityPage): sign-in methods, the
 * last ten sign-ins, and deleting the account (also what the app stores ask
 * every app to offer from inside the app).
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, Shield, Smartphone } from 'lucide-react-native';
import { useGetMeQuery } from '@zappy/core/api';
import { ScreenHeader, Text } from '@zappy/ui/components';
import { DeleteAccountCard } from '@zappy/ui/components/account/DeleteAccountCard';
import { LoginSecurityCard } from '@zappy/ui/components/account/LoginSecurityCard';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Login { device?: string; ip?: string; at: string }

export function AccountSecurityPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data } = useGetMeQuery(undefined);
  const history: Login[] = (data?.user?.loginHistory ?? []).slice(0, 10);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('security.title', 'Account Security')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <LoginSecurityCard />
        <View style={styles.card}>
          <View style={styles.head}><Shield size={16} color={zappy[500]} /><Text variant="bodySmall" weight="semibold">{t('security.recent', 'Recent Login Activity')}</Text></View>
          {!history.length ? <Text variant="caption" color={ink[400]}>{t('security.noHistory', 'No login history available')}</Text> : history.map((e, i) => (
            <View key={`${e.at}-${i}`} style={styles.row}>
              <Smartphone size={16} color={slate[300]} />
              <View style={styles.flex}>
                <Text variant="bodySmall" color={ink[700]}>{e.device || t('security.unknownDevice', 'Unknown device')}</Text>
                <View style={styles.inline}>
                  <Text variant="caption" color={ink[400]}>{e.ip || '—'} · </Text>
                  <Clock size={11} color={ink[400]} />
                  <Text variant="caption" color={ink[400]}>{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              </View>
              {i === 0 ? <View style={styles.current}><Text variant="caption" weight="medium" color={success[600]}>{t('security.current', 'Current')}</Text></View> : null}
            </View>
          ))}
        </View>
        <DeleteAccountCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.base, padding: spacing.base },
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  current: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: success[50] },
});
