/**
 * What the customer wants to hear about (the website's NotificationPrefsPage):
 * one switch per kind, saved the moment it flips, flipped back if the save fails.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, CheckCircle2 } from 'lucide-react-native';
import { useGetNotificationPrefsQuery, useUpdateNotificationPrefsMutation } from '@zappy/core/api';
import { LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const ITEMS: [string, string, string][] = [
  ['orderUpdates', 'Order Updates', 'Status changes, worker assignment, arrival'],
  ['workerArrival', 'Worker Arrival', 'Alert when your worker is nearby'],
  ['payments', 'Payments', 'Refunds, wallet credit, invoices'],
  ['disputes', 'Disputes & Support', 'Replies to your tickets and disputes'],
  ['promotions', 'Promotions', 'New promo codes and seasonal offers'],
  ['marketing', 'Marketing', 'Tips, new services, feature updates'],
];

export function NotificationPrefsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useGetNotificationPrefsQuery(undefined);
  const [update] = useUpdateNotificationPrefsMutation();
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data?.prefs) setPrefs(data.prefs); }, [data]);
  useEffect(() => { if (!saved) return undefined; const id = setTimeout(() => setSaved(false), 2000); return () => clearTimeout(id); }, [saved]);

  async function flip(key: string) {
    if (!prefs) return;
    const before = prefs;
    const value = !prefs[key];
    setPrefs({ ...prefs, [key]: value });
    try { await update({ [key]: value }).unwrap(); setSaved(true); }
    catch { setPrefs(before); toast.error(t('prefs.saveFailed', 'Could not save that. Try again.')); }
  }
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('prefs.title', 'Notification Preferences')} onBack={back}
        right={saved ? <View style={styles.saved}><CheckCircle2 size={14} color={success[600]} /><Text variant="caption" color={success[600]}>{t('common.saved', 'Saved')}</Text></View> : null} />
      {isLoading || !prefs ? <LoadingState /> : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.card}>
            {ITEMS.map(([key, label, desc], i) => (
              <View key={key} style={[styles.row, i > 0 && styles.rule]}>
                <Bell size={16} color={slate[400]} />
                <View style={styles.flex}>
                  <Text variant="bodySmall" weight="medium">{t(`prefs.${key}`, label)}</Text>
                  <Text variant="caption" color={ink[500]}>{t(`prefs.${key}.sub`, desc)}</Text>
                </View>
                <Switch value={!!prefs[key]} onValueChange={() => flip(key)} trackColor={{ true: zappy[600], false: slate[200] }} thumbColor="#fff" accessibilityLabel={label} />
              </View>
            ))}
          </View>
          <Text variant="caption" color={ink[400]} style={styles.center}>{t('prefs.instant', 'Changes are saved instantly')}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.base, padding: spacing.base },
  card: { borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  rule: { borderTopWidth: 1, borderTopColor: colors.border },
  flex: { flex: 1, minWidth: 0 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  center: { textAlign: 'center' },
});
