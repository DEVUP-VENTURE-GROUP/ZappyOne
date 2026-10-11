/** What the event costs and what is paid: package, our fee, advance, balance on the day. */
import { StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { accent, colors, ink, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { rupees } from '../ThemeCard';
import { PayLine } from './PayLine';

export interface EventPricing { themePricePaise?: number; platformFeePaise?: number; totalPaise?: number; advancePaise?: number; remainingPaise?: number }

export function EventPaymentCard({ pricing = {}, advancePaid, remainingPaid }: { pricing?: EventPricing; advancePaid: boolean; remainingPaid: boolean }) {
  return (
    <View style={styles.card}>
      <Text variant="caption" weight="bold" color={ink[500]}>PAYMENT</Text>
      {pricing.platformFeePaise ? (
        <>
          <PayLine label="Package" value={rupees(pricing.themePricePaise)} />
          <PayLine label="Platform fee" value={rupees(pricing.platformFeePaise)} />
        </>
      ) : null}
      <PayLine label="Total" value={rupees(pricing.totalPaise)} bold />
      <PayLine label="Advance" value={advancePaid ? `Paid ${rupees(pricing.advancePaise)}` : 'Pending'} color={advancePaid ? success[700] : ink[400]} />
      <PayLine label="Balance" value={remainingPaid ? `Paid ${rupees(pricing.remainingPaise)}` : `${rupees(pricing.remainingPaise)} due`} color={remainingPaid ? success[700] : accent[700]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
