/** One label and amount on the payment card. */
import { StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { ink } from '@zappy/ui/theme/colors';

export function PayLine({ label, value, color = ink[900], bold = false }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <View style={styles.line}>
      <Text variant="bodySmall" color={bold ? ink[900] : ink[500]} weight={bold ? 'black' : 'regular'}>{label}</Text>
      <Text variant="bodySmall" weight={bold ? 'black' : 'semibold'} color={color}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ line: { flexDirection: 'row', justifyContent: 'space-between' } });
