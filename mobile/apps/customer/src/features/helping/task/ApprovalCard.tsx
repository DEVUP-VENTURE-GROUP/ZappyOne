/** A decision the helper needs (a price changed, an alternative): what it was, what it is now, approve or decline. */
import { StyleSheet, View } from 'react-native';
import { AlertTriangle, Check, X } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Approval { _id: string; status: string; reason?: string; previousAmountPaise: number; newAmountPaise: number }

export function ApprovalCard({ a, onAnswer }: { a: Approval; onAnswer: (approved: boolean) => void }) {
  const t = useT();
  return (
    <View style={styles.card}>
      <View style={styles.row}><AlertTriangle size={16} color={accent[600]} /><Text variant="bodySmall" weight="bold" color={accent[700]} style={styles.flex}>{a.reason || t('helpTask.decision', 'Your helper needs a decision')}</Text></View>
      <View style={styles.compare}>
        <Text variant="bodySmall" color={ink[500]}>{t('helpTask.was', 'Was')}</Text><Text variant="bodySmall" weight="bold">{formatPaise(a.previousAmountPaise)}</Text>
        <Text variant="bodySmall" color={ink[300]}>→</Text>
        <Text variant="bodySmall" color={ink[500]}>{t('helpTask.now', 'Now')}</Text><Text variant="bodySmall" weight="bold" color={accent[700]}>{formatPaise(a.newAmountPaise)}</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}><Button label={t('helpTask.decline', 'Decline')} variant="outline" icon={<X size={15} color={ink[700]} />} onPress={() => onAnswer(false)} fullWidth /></View>
        <View style={styles.flex}><Button label={t('helpTask.approve', 'Approve')} icon={<Check size={15} color="#fff" />} onPress={() => onAnswer(true)} fullWidth /></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: accent[500], backgroundColor: accent[50] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  compare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderRadius: radius.medium, backgroundColor: colors.surface },
});
