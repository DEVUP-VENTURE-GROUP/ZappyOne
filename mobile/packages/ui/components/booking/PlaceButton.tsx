/** A place in a booking (where, destination): its label and the chosen address, tapping opens the map picker. */
import { Pressable, StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Text } from '../Text';
import { RIPPLE } from '../../lib/feedback';
import { colors, ink, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function PlaceButton({ label, value, placeholder, color = zappy[500], onPress }: { label: string; value?: string; placeholder: string; color?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} android_ripple={RIPPLE} accessibilityRole="button" accessibilityLabel={label} style={styles.row}>
      <MapPin size={18} color={color} />
      <View style={styles.flex}>
        <Text variant="caption" color={ink[400]}>{label}</Text>
        <Text variant="bodySmall" weight="bold" numberOfLines={1}>{value || placeholder}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0 },
});
