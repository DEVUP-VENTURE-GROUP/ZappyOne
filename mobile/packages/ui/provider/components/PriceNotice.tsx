// The one line above every price a provider types (menu, model prices, pet and helping rates).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BadgeIndianRupee } from 'lucide-react-native';
import { PRICE_NOTICE } from '@zappy/core/shared/jobFlows';
import { Text } from '../../components';
import { zappy } from '../../theme/colors';

export function PriceNotice() {
  return (
    <View accessibilityRole="text" style={styles.box}>
      <BadgeIndianRupee size={17} color={zappy[700]} />
      <Text variant="bodySmall" weight="semibold" color={zappy[800]} style={styles.text}>{PRICE_NOTICE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: zappy[100], backgroundColor: zappy[50], paddingHorizontal: 12, paddingVertical: 10 },
  text: { flex: 1 },
});
