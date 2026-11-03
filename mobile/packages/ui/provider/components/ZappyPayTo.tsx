/** Where to pay ZappyOne outside the app (admin sets it in Economics → Dues; the website's ZappyPayTo): UPI with the amount filled in, or the bank account. */
import { StyleSheet, View } from 'react-native';
import { Landmark, Smartphone } from 'lucide-react-native';
import { Button, Text } from '../../components';
import { openLink } from '../../lib/openLink';
import { colors, ink, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export interface PayTo { upiId: string | null; accountName: string; bankName: string | null; accountNumber: string | null; ifsc: string | null }

export function ZappyPayTo({ payTo, amountPaise = 0 }: { payTo?: PayTo | null; amountPaise?: number }) {
  if (!payTo) return null;
  const q = [`pa=${encodeURIComponent(payTo.upiId || '')}`, `pn=${encodeURIComponent(payTo.accountName || 'ZappyOne')}`, ...(amountPaise > 0 ? [`am=${(amountPaise / 100).toFixed(2)}`] : []), 'cu=INR', `tn=${encodeURIComponent('ZappyOne dues')}`].join('&');
  return (
    <View style={styles.box}>
      <Text variant="caption" weight="bold" color={ink[500]}>PAY ZAPPYONE AT</Text>
      {payTo.upiId ? (
        <View style={styles.row}>
          <Smartphone size={15} color={zappy[600]} />
          <Text variant="bodySmall" weight="semibold" selectable style={styles.flex}>{payTo.upiId}</Text>
          <Button label="Open UPI app" size="small" onPress={() => openLink(`upi://pay?${q}`, 'No UPI app on this phone. Copy the UPI ID instead.')} />
        </View>
      ) : null}
      {payTo.accountNumber ? (
        <View style={styles.row}>
          <Landmark size={15} color={zappy[600]} />
          <View style={styles.flex}>
            <Text variant="caption" weight="semibold">{payTo.accountName}</Text>
            <Text variant="caption" selectable>{payTo.accountNumber}</Text>
            <Text variant="caption" color={ink[500]}>{[payTo.ifsc && `IFSC ${payTo.ifsc}`, payTo.bankName].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
      ) : null}
      <Text variant="caption" color={ink[500]}>After paying, tap "Paid another way? Tell ZappyOne" with the reference. Long-press to copy.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: spacing.md, gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});
