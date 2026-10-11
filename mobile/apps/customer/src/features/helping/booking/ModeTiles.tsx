/** Two photo tiles to switch a helping booking's mode (shop or pick up, return or exchange). */
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function ModeTiles<K extends string>({ options, value, onChange }: { options: [K, string, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={styles.row}>
      {options.map(([key, label, photo]) => {
        const on = value === key;
        const uri = webAsset(photo);
        return (
          <Pressable key={key} onPress={() => onChange(key)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.tile, on && styles.on]}>
            {uri ? <Image source={{ uri }} style={styles.photo} /> : <View style={[styles.photo, styles.blank]} />}
            <Text variant="bodySmall" weight="bold" color={on ? ink[900] : ink[500]} style={styles.label}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  tile: { flex: 1, overflow: 'hidden', borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  on: { borderColor: zappy[600] },
  photo: { width: '100%', aspectRatio: 16 / 10 },
  blank: { backgroundColor: zappy[50] },
  label: { paddingHorizontal: spacing.md, paddingVertical: 10 },
});
