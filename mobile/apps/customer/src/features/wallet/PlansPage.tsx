import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { useCancelSubscriptionMutation, useListPlansQuery, useMySubscriptionQuery } from '@zappy/core/api';
import { Button, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { openLink } from '@zappy/ui/lib/openLink';
import { colors, danger, ink, slate, success } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';

type Plan = { code: string; name: string; priceInPaise: number; durationDays: number; benefits?: string[] };
type Sub = { _id: string; planCode: string; endAt: string; benefits?: string[] };
const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

function Benefits({ items }: { items: string[] }) {
  return (
    <View style={styles.list}>
      {items.map((b) => (
        <View key={b} style={styles.row}><Check size={17} color={success[700]} /><Text variant="body" style={styles.flex}>{b}</Text></View>
      ))}
    </View>
  );
}

// Membership (the website's PlansPage): only perks the server applies at booking; joining opens the website checkout once payment is live.
export function PlansPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: plansData, isLoading } = useListPlansQuery('user');
  const { data, isLoading: subLoading, refetch } = useMySubscriptionQuery(undefined);
  const [cancel, { isLoading: cancelling }] = useCancelSubscriptionMutation();
  const [confirming, setConfirming] = useState(false);
  const sub = data?.subscription as Sub | undefined;
  const plans: Plan[] = (plansData?.plans || []).filter((p: Plan) => p.benefits?.length);
  const purchasable = !!plansData?.purchasable;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  async function stop() {
    try { await cancel(sub!._id).unwrap(); toast.success('Membership cancelled'); setConfirming(false); refetch(); }
    catch (err) { toast.error(errText(err, 'Could not cancel. Try again.')); }
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title="Membership" onBack={back} />
      {isLoading || subLoading ? <LoadingState /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
          {sub ? (
            <View style={styles.section}>
              <Text variant="caption" weight="bold" color={success[700]}>ACTIVE</Text>
              <Text variant="heading2" weight="extrabold">{plans.find((p) => p.code === sub.planCode)?.name || sub.planCode}</Text>
              <Text variant="bodySmall" color={ink[500]}>Valid until {new Date(sub.endAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              <Benefits items={sub.benefits || []} />
              {confirming ? (
                <View style={styles.confirm}>
                  <Text variant="bodySmall" weight="semibold" color={danger[600]}>Cancel your membership? Its benefits stop now.</Text>
                  <View style={styles.row}>
                    <View style={styles.flex}><Button label="Keep it" variant="outline" onPress={() => setConfirming(false)} fullWidth /></View>
                    <View style={styles.flex}><Button label="Cancel it" variant="danger" loading={cancelling} onPress={stop} fullWidth /></View>
                  </View>
                </View>
              ) : <Button label="Cancel membership" variant="ghost" onPress={() => setConfirming(true)} fullWidth />}
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <Text variant="heading2" weight="extrabold">Pay less on every booking</Text>
                <Text variant="body" color={ink[500]}>One monthly price. The benefits apply to every repair, pet care and helper booking on its own, at checkout.</Text>
                {!purchasable ? <View style={styles.note}><Text variant="bodySmall" color={ink[700]}>Memberships open when online payment starts. You will see them here.</Text></View> : null}
              </View>
              {plans.length === 0 ? <View style={styles.section}><Text variant="body" color={ink[500]}>No memberships are on offer right now.</Text></View> : plans.map((plan) => (
                <View key={plan.code} style={styles.section}>
                  <View style={styles.head}>
                    <Text variant="heading3" weight="extrabold" style={styles.flex}>{plan.name}</Text>
                    <Text variant="body" weight="bold">{rupees(plan.priceInPaise)}<Text variant="bodySmall" color={ink[500]}> / {plan.durationDays} days</Text></Text>
                  </View>
                  <Benefits items={plan.benefits || []} />
                  {purchasable ? <Button label={`Join for ${rupees(plan.priceInPaise)}`} onPress={() => openLink('https://zappyone.com/plans', 'The website could not be opened.')} fullWidth /> : null}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  section: { gap: spacing.sm, padding: spacing.base, borderBottomWidth: 8, borderBottomColor: slate[100] },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  list: { gap: spacing.sm, marginVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  note: { padding: spacing.md, borderRadius: 10, backgroundColor: slate[100] },
  confirm: { gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});
