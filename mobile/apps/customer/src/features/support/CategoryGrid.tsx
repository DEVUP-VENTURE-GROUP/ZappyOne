/** Pick what a ticket or dispute is about: a two-column grid of icon choices, one selected. */
import { Pressable, StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function CategoryGrid({ options, value, onChange, keyPrefix }: { options: { value: string; label: string; Icon: LucideIcon }[]; value: string; onChange: (v: string) => void; keyPrefix: string }) {
  const t = useT();
  return (
    <View style={styles.grid}>
      {options.map(({ value: v, label, Icon }) => {
        const on = value === v;
        return (
          <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.cat, on && styles.on]}>
            <Icon size={15} color={on ? '#fff' : ink[700]} /><Text variant="caption" weight="semibold" color={on ? '#fff' : ink[700]} style={styles.flex}>{t(`${keyPrefix}.${v}`, label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cat: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.medium, backgroundColor: slate[50], borderWidth: 1, borderColor: colors.border },
  on: { backgroundColor: ink[900], borderColor: ink[900] },
  flex: { flexShrink: 1 },
});
