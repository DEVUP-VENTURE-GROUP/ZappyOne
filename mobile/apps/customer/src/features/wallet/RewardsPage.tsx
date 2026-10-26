/**
 * Rewards (the website's RewardsPage): points and what they are worth,
 * redeeming them to the wallet, scratch cards to open, and the points history.
 * Hidden behind "coming soon" until admin switches rewards on.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Coins, Gift, Wallet } from 'lucide-react-native';
import { useGetRewardsQuery, useRedeemRewardPointsMutation, useScratchRewardCardMutation } from '@zappy/core/api';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { ScratchCard, type Card } from './ScratchCard';

const REASON: Record<string, string> = { order: 'Order reward', referral: 'Referral bonus', referee_join: 'Welcome bonus', scratch: 'Scratch card', redeem: 'Redeemed to wallet', admin_grant: 'Bonus from ZappyOne' };

export function RewardsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useGetRewardsQuery(undefined);
  const [redeem, { isLoading: redeeming }] = useRedeemRewardPointsMutation();
  const [scratch, { isLoading: scratching }] = useScratchRewardCardMutation();
  const [reveal, setReveal] = useState<{ type: string; label: string } | null>(null);
  const d = data || {};
  const points: number = d.points || 0;
  const min: number = d.minRedeemPoints || 100;
  const cards: Card[] = d.scratchCards || [];
  const active = cards.filter((c) => c.status === 'active');
  const opened = cards.filter((c) => c.status === 'scratched').slice(0, 6);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  async function doScratch(id: string) {
    try {
      const r = (await scratch(id).unwrap()).reward;
      if (r && r.type !== 'none') { setReveal(r); toast.success(t('rewards.toast.won', 'You won {x}!').replace('{x}', r.label)); }
      else toast(t('rewards.toast.betterLuck', 'Better luck next time!'));
    } catch (err) { toast.error(errText(err, t('rewards.toast.scratchFailed', 'Could not open that card. Try again.'))); }
  }
  async function doRedeem() {
    try { const res = await redeem(points).unwrap(); toast.success(t('rewards.toast.redeemed', '₹{x} added to your wallet').replace('{x}', String(res.creditedRupees))); }
    catch (err) { toast.error(errText(err, t('rewards.toast.redeemFailed', 'Could not redeem. Try again.'))); }
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('rewards.title', 'Rewards')} onBack={back} />
      {isLoading ? <LoadingState /> : !d.enabled ? (
        <EmptyState icon={<Gift size={36} color={slate[300]} />} title={t('rewards.comingSoon', 'Rewards are coming soon.')} />
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.balance}>
            <View style={styles.inline}><Coins size={14} color="rgba(255,255,255,0.8)" /><Text variant="caption" weight="bold" color="rgba(255,255,255,0.8)">{t('rewards.yourPoints', 'YOUR POINTS')}</Text></View>
            <View style={styles.between}><Text variant="display" weight="black" color="#fff">{points.toLocaleString('en-IN')}</Text><Text variant="bodySmall" color="rgba(255,255,255,0.8)">≈ ₹{d.redeemableRupees || 0}</Text></View>
            <Pressable onPress={doRedeem} disabled={points < min || redeeming} accessibilityRole="button" style={[styles.redeem, (points < min || redeeming) && styles.dim]}>
              <Wallet size={16} color="#fff" />
              <Text variant="bodySmall" weight="bold" color="#fff">{points >= min ? t('rewards.redeemAll', 'Redeem all → ₹{x}').replace('{x}', String(d.redeemableRupees)) : t('rewards.earnMore', 'Earn {n} more to redeem').replace('{n}', String(min - points))}</Text>
            </Pressable>
          </View>
          {active.length ? (
            <View style={styles.gap}>
              <View style={styles.inline}><Gift size={13} color={zappy[500]} /><Text variant="caption" weight="black" color={ink[500]}>{t('rewards.scratchWin', 'SCRATCH & WIN')}</Text></View>
              <View style={styles.grid}>{active.map((c) => <ScratchCard key={c.id} card={c} onScratch={doScratch} revealing={scratching} />)}</View>
            </View>
          ) : null}
          {opened.length ? (
            <View style={styles.gap}>
              <Text variant="caption" weight="black" color={ink[400]}>{t('rewards.recentlyOpened', 'RECENTLY OPENED')}</Text>
              <View style={styles.grid}>{opened.map((c) => <ScratchCard key={c.id} card={c} />)}</View>
            </View>
          ) : null}
          {!active.length && !opened.length ? <EmptyState icon={<Gift size={36} color={slate[300]} />} title={t('rewards.earnHint', 'Complete a booking to earn scratch cards and points.')} /> : null}
          {(d.history || []).length ? (
            <View style={styles.card}>
              <Text variant="caption" weight="black" color={ink[400]}>{t('rewards.pointsActivity', 'POINTS ACTIVITY')}</Text>
              {(d.history as { reason: string; at: string; delta: number }[]).map((h, i) => (
                <View key={`${h.at}-${i}`} style={styles.hist}>
                  <View><Text variant="bodySmall" weight="semibold">{t(`rewards.reason.${h.reason}`, REASON[h.reason] || h.reason)}</Text><Text variant="caption" color={ink[400]}>{new Date(h.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text></View>
                  <Text variant="bodySmall" weight="black" color={h.delta >= 0 ? success[600] : ink[400]}>{h.delta >= 0 ? '+' : ''}{h.delta}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
      <Modal visible={!!reveal} transparent animationType="fade" onRequestClose={() => setReveal(null)}>
        <Pressable style={styles.backdrop} onPress={() => setReveal(null)}>
          <View style={styles.won}>
            <Gift size={48} color={accent[500]} />
            <Text variant="heading2" weight="black">{t('rewards.youWon', 'You won!')}</Text>
            <Text variant="body" weight="bold" color={zappy[600]}>{reveal?.label}</Text>
            <Text variant="bodySmall" color={ink[500]}>{reveal?.type === 'cashback' ? t('rewards.toWallet', 'Added to your wallet') : t('rewards.toBalance', 'Points added to your balance')}</Text>
            <Button label={t('rewards.awesome', 'Awesome')} variant="secondary" onPress={() => setReveal(null)} fullWidth />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.lg, padding: spacing.base },
  balance: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.large, backgroundColor: zappy[600] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  between: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  redeem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm, paddingVertical: 10, borderRadius: radius.medium, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.15)' },
  dim: { opacity: 0.5 },
  gap: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  hist: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(0,0,0,0.6)' },
  won: { width: '100%', maxWidth: 320, alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radius.large, backgroundColor: colors.surface },
});
