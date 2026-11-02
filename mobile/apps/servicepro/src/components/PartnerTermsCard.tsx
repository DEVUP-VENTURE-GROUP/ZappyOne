/** Shown until this partner has accepted the current partner terms (the website's PartnerTermsCard); hidden once they have. */
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle2, FileSignature } from 'lucide-react-native';
import { useAcceptShopAgreementMutation, useShopAgreementQuery } from '@zappy/core/api';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Terms { ratePct: number; points: string[]; fullTermsUrl: string }

export function PartnerTermsCard() {
  const { data } = useShopAgreementQuery(undefined);
  const [accept, { isLoading }] = useAcceptShopAgreementMutation();
  const d = data as { terms: Terms; agreement: unknown; current: boolean } | undefined;
  if (!d || d.current) return null;
  const agree = () => accept(undefined).unwrap().then(() => toast.success('Partner terms accepted')).catch((e: unknown) => toast.error(errText(e, 'Could not save. Try again.')));
  return (
    <View style={styles.card}>
      <View style={styles.head}><FileSignature size={18} color="#B45309" /><Text variant="body" weight="bold">{d.agreement ? 'Our partner terms have changed' : 'Accept the partner terms'}</Text></View>
      <Text variant="bodySmall" weight="bold">Keep what you charge</Text>
      {d.terms.points.map((p) => (
        <View key={p} style={styles.point}><CheckCircle2 size={14} color={success[600]} style={styles.tick} /><Text variant="caption" color={ink[500]} style={styles.flex}>{p}</Text></View>
      ))}
      <Pressable onPress={() => Linking.openURL(d.terms.fullTermsUrl)} accessibilityRole="link"><Text variant="caption" weight="semibold" color={zappy[600]}>Read the full terms</Text></Pressable>
      <Button label={isLoading ? 'Saving…' : 'I accept the partner terms'} loading={isLoading} onPress={agree} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  point: { flexDirection: 'row', gap: spacing.sm },
  tick: { marginTop: 2 },
  flex: { flex: 1 },
});
