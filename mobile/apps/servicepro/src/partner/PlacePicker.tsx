/** Choose the Telangana cities and towns served (the events website's PlacePicker). Stores slugs; never free text. */
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { TELANGANA_PLACES, placeName } from '@zappy/core/shared/telanganaPlaces';
import { Text } from '@zappy/ui/components';
import { colors, danger, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function PlacePicker({ value = [], onChange }: { value?: string[]; onChange: (v: string[]) => void }) {
  const set = new Set(value.map((v) => String(v).toLowerCase()));
  const toggle = (slug: string) => onChange(set.has(slug) ? value.filter((v) => String(v).toLowerCase() !== slug) : [...value, slug]);
  const legacy = value.filter((v) => !TELANGANA_PLACES.some((p: { slug: string }) => p.slug === String(v).toLowerCase()));
  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {TELANGANA_PLACES.map((p: { slug: string }) => {
          const on = set.has(p.slug);
          return (
            <Pressable key={p.slug} onPress={() => toggle(p.slug)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.on]}>
              {on ? <Check size={14} color={zappy[700]} /> : null}
              <Text variant="caption" weight="semibold" color={on ? zappy[700] : ink[700]}>{placeName(p.slug)}</Text>
            </Pressable>
          );
        })}
      </View>
      {legacy.length ? (
        <View style={styles.grid}>
          <Text variant="caption" color={danger[600]}>Not in Telangana (tap to remove):</Text>
          {legacy.map((v) => <Pressable key={v} onPress={() => toggle(String(v).toLowerCase())} accessibilityRole="button"><Text variant="caption" weight="bold" color={danger[600]}>{v}</Text></Pressable>)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  on: { borderColor: zappy[600], backgroundColor: zappy[50] },
});
