/**
 * Everything the customer has told us, on one card (the website's
 * ChosenSummary): device, fault, how, and where, with the address one tap from
 * being corrected without losing the rest of the flow.
 */
import { deviceName } from '@zappy/core/shared/deviceName';
import { Pressable, StyleSheet, View } from 'react-native';
import { MapPin, Wrench } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Diagnosis } from './DiagnoseStep';
import { flow } from './FlowChrome';
import { MODE_LABEL } from './repairRules';

export function ChosenSummary({ brand, model, configuration, problem, diagnosis, serviceMode, location, onChangeLocation }: {
  brand?: { name: string } | null; model?: { name: string } | null; configuration?: { name: string } | null; problem?: { name: string } | null;
  diagnosis?: Diagnosis | null; serviceMode: string; location: BookingLocation | null; onChangeLocation: () => void;
}) {
  const device = deviceName(brand, model) || 'Your device';
  const fault = problem?.name || diagnosis?.recommendations?.[0]?.repairName || diagnosis?.summary;
  return (
    <View style={flow.card}>
      <View style={styles.top}>
        <View style={flow.flex}>
          <Text variant="caption" weight="black" color={ink[400]}>YOUR BOOKING</Text>
          <Text variant="bodySmall" weight="bold" numberOfLines={1}>{device}</Text>
          {configuration?.name ? <Text variant="caption" color={ink[500]}>{configuration.name}</Text> : null}
        </View>
        <View style={styles.mode}><Text variant="caption" weight="bold" color={ink[700]}>{MODE_LABEL[serviceMode] || serviceMode}</Text></View>
      </View>
      {fault ? <View style={styles.fault}><Wrench size={12} color={ink[400]} /><Text variant="caption" color={ink[700]} style={flow.flex}>{fault}</Text></View> : null}
      <Pressable onPress={onChangeLocation} accessibilityRole="button" accessibilityLabel="Change address" style={styles.addr}>
        <MapPin size={12} color={zappy[500]} />
        <Text variant="caption" color={ink[700]} style={flow.flex}>{location?.address || 'Your pinned location'}</Text>
        <Text variant="caption" weight="bold" color={zappy[600]}>Change</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  mode: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: slate[100] },
  fault: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  addr: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: slate[50] },
});
