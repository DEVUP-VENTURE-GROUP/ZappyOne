/**
 * Plans (the website's PlansPage). Memberships are not sold until every
 * benefit they list applies at checkout, and buying one is online-only, which
 * the apps do not take; so a customer without a plan sees "coming soon", and
 * one who already holds a plan sees it here and can cancel it.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, Crown } from 'lucide-react-native';
import { useCancelSubscriptionMutation, useMySubscriptionQuery } from '@zappy/core/api';
import { Button, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, danger, ink, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function PlansPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading, refetch } = useMySubscriptionQuery(undefined);
  const [cancel, { isLoading: cancelling }] = useCancelSubscriptionMutation();
  const [confirming, setConfirming] = useState(false);
  const sub = data?.subscription as { _id: string; planCode: string; endAt: string } | undefined;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  async function stop() {
    try { await cancel(sub!._id).unwrap(); toast.success(t('plans.cancelled', 'Subscription cancelled')); setConfirming(false); refetch(); }
    catch (err) { toast.error(errText(err, t('plans.cancelFailed', 'Could not cancel. Try again.'))); }
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('plans.title', 'Plans')} onBack={back} />
      {isLoading ? <LoadingState /> : (
        <View style={styles.body}>
          <View style={styles.icon}><Crown size={32} color={accent[600]} /></View>
          {!sub ? (
            <>
              <Text variant="heading3" weight="bold" style={styles.center}>{t('plans.soon', 'Plans are coming soon')}</Text>
              <Text variant="bodySmall" color={ink[500]} style={styles.center}>{t('plans.soonBody', 'We are finishing ZappyOne memberships. When they open, every benefit listed will apply to your bookings automatically.')}</Text>
              <Button label={t('common.back', 'Go back')} variant="outline" onPress={back} fullWidth />
            </>
          ) : (
            <View style={styles.card}>
              <View style={styles.row}><CheckCircle2 size={18} color={success[600]} /><Text variant="body" weight="black">{sub.planCode}</Text></View>
              <Text variant="caption" color={ink[500]}>{t('plans.renews', 'Renews')} {new Date(sub.endAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              {confirming ? (
                <View style={styles.confirm}>
                  <Text variant="bodySmall" weight="semibold" color={danger[600]}>{t('plans.confirm', 'Cancel your subscription? Its benefits stop at the end of this period.')}</Text>
                  <View style={styles.row}>
                    <View style={styles.flex}><Button label={t('plans.keep', 'Keep it')} variant="outline" onPress={() => setConfirming(false)} fullWidth /></View>
                    <View style={styles.flex}><Button label={t('plans.cancelIt', 'Cancel it')} variant="danger" loading={cancelling} onPress={stop} fullWidth /></View>
                  </View>
                </View>
              ) : <Button label={t('plans.cancel', 'Cancel subscription')} variant="ghost" onPress={() => setConfirming(true)} fullWidth />}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  icon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: accent[50] },
  center: { textAlign: 'center' },
  card: { alignSelf: 'stretch', gap: spacing.sm, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: success[100], backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  confirm: { gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
});
