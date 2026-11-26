import React, { useState } from 'react';
import { Share, StyleSheet, TextInput, View } from 'react-native';
import { Gift, Share2 } from 'lucide-react-native';
import { usePartnerReferralQuery, useApplyReferralMutation } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '../../components';
import { toast } from '../../components/Toast';
import { errText } from '../../lib/feedback';
import { useTl } from '../../lib/i18n';
import { colors, ink, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

type Card = { on: boolean; code: string; rewardPaise: number; jobs: number; shareText: string; invited: number; rewarded: number; earnedPaise: number; canEnterCode: boolean; joinedWithCode: string | null };

// Invite another partner with your code; hidden until a reward is set in Admin → Economics → Partners.
export function InvitePartnersCard() {
  const { data } = usePartnerReferralQuery(undefined);
  const [apply, { isLoading }] = useApplyReferralMutation();
  const [code, setCode] = useState('');
  const tl = useTl();
  const c: Card | undefined = data?.card;
  if (!c?.on) return null;

  async function enter() {
    try { await apply(code.trim()).unwrap(); toast.success(`Code saved. Finish ${c!.jobs} jobs to get your bonus.`); setCode(''); }
    catch (err) { toast.error(errText(err, 'That code did not work')); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}><Gift size={18} color={zappy[700]} /></View>
        <View style={styles.flex}>
          <Text variant="body" weight="bold">{tl('Invite partners, earn {amount}', { amount: formatPaise(c.rewardPaise) })}</Text>
          <Text variant="caption" color={ink[500]}>{tl('When a partner you invite finishes {jobs} jobs, you both get {amount} in your earnings.', { jobs: c.jobs, amount: formatPaise(c.rewardPaise) })}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.code}><Text variant="body" weight="bold" selectable style={styles.mono}>{c.code}</Text></View>
        <Button label={tl('Invite')} size="small" icon={<Share2 size={15} color="#fff" />} onPress={() => { Share.share({ message: c.shareText }).catch(() => {}); }} />
      </View>
      {c.invited > 0 ? <Text variant="caption" color={ink[700]}>{c.invited} invited, {c.rewarded} finished, {formatPaise(c.earnedPaise)} earned</Text> : null}
      {c.joinedWithCode === 'signup' ? <Text variant="caption" color={ink[700]} style={styles.note}>You joined with a partner's code. Finish {c.jobs} jobs to get your {formatPaise(c.rewardPaise)}.</Text> : null}
      {c.canEnterCode ? (
        <View style={[styles.row, styles.rule]}>
          <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase())} maxLength={16} autoCapitalize="characters" placeholder={tl("Got a partner's code?")}
            placeholderTextColor={ink[400]} style={styles.input} accessibilityLabel="A partner's invite code" />
          <Button label={tl('Apply')} size="small" variant="outline" loading={isLoading} disabled={code.trim().length < 4} onPress={enter} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  code: { flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.button, borderWidth: 1, borderStyle: 'dashed', borderColor: slate[300] },
  mono: { letterSpacing: 2 },
  note: { backgroundColor: slate[50], borderRadius: radius.button, padding: spacing.sm },
  rule: { borderTopWidth: 1, borderTopColor: slate[100], paddingTop: spacing.md },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
});
