/** An approved service with nothing to set up here (pet care, helping): say so, and what brings its jobs. */
import { StyleSheet, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { Button, Text } from '../../../components';
import { colors, ink, success } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';

export function ReadyService({ name, isShop, onHours }: { name: string; isShop: boolean; onHours: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <CheckCircle2 size={20} color={success[600]} />
        <View style={styles.flex}>
          <Text variant="body" weight="bold">{name} is ready</Text>
          <Text variant="bodySmall" color={ink[700]}>
            Nothing to set up here. ZappyOne sets the price for this service, and jobs near you
            {isShop ? ' come to your shop while it is open.' : ' ring while you are online, and bookings for later come inside your hours.'}
          </Text>
        </View>
      </View>
      <Button label={isShop ? 'Shop & hours' : 'Set my hours'} variant="outline" onPress={onHours} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.base, gap: spacing.md },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0, gap: 2 },
});
