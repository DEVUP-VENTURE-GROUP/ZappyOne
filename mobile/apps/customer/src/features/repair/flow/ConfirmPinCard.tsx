/**
 * The address is checked before anyone is shown (the website opens its map
 * first). With a remembered place the customer confirms it in one tap or moves
 * the pin; with none, the map is the only way on.
 */
import { StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Button, Text } from '@zappy/ui/components';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { Shell, flow } from './FlowChrome';

export function ConfirmPinCard({ location, onConfirm, onPick }: { location: BookingLocation | null; onConfirm: () => void; onPick: () => void }) {
  return (
    <Shell>
      <View style={[flow.card, styles.card]}>
        <View style={styles.icon}><MapPin size={22} color={zappy[600]} /></View>
        <Text variant="body" weight="bold">Where should we come?</Text>
        {location ? <Text variant="bodySmall" color={ink[700]} style={styles.center}>{location.address}</Text>
          : <Text variant="caption" color={ink[500]} style={styles.center}>Pin the exact spot so we only show technicians who can reach you.</Text>}
      </View>
      {location ? <Button label="Yes, come here" onPress={onConfirm} fullWidth /> : null}
      <Button label={location ? 'Move the pin' : 'Pin my location'} variant={location ? 'outline' : 'primary'} onPress={onPick} fullWidth />
    </Shell>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  icon: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  center: { textAlign: 'center' },
});
