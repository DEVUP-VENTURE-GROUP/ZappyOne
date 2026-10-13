/** One amount on a group's bill: items, discount (green, minus), the visit and service fee, taxes. */
import { StyleSheet, View } from 'react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { ink, success } from '@zappy/ui/theme/colors';

export function GroupLine({ label, paise, green = false }: { label: string; paise: number; green?: boolean }) {
  const color = green ? success[700] : ink[700];
  return (
    <View style={styles.line}>
      <Text variant="caption" weight="semibold" color={color}>{label}</Text>
      <Text variant="caption" weight="semibold" color={color}>{paise < 0 ? `−${formatPaise(-paise)}` : formatPaise(paise)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ line: { flexDirection: 'row', justifyContent: 'space-between' } });
