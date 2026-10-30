/** Choose the app's language (the website's LanguageSwitcher, menu style): each language in its own script. */
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '../Text';
import { useI18n } from '../../lib/i18n';
import { colors, ink, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function LanguageSwitcher() {
  const { lang, setLang, languages } = useI18n();
  return (
    <View style={styles.card}>
      {(languages as { code: string; label: string; native?: string }[]).map((l) => {
        const on = l.code === lang;
        return (
          <Pressable key={l.code} onPress={() => setLang(l.code)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.row, on && styles.on]}>
            <Text variant="bodySmall" weight={on ? 'bold' : 'medium'} color={on ? zappy[700] : ink[700]} style={styles.flex}>{l.native || l.label}</Text>
            {l.native && l.native !== l.label ? <Text variant="caption" color={ink[400]}>{l.label}</Text> : null}
            {on ? <Check size={16} color={zappy[600]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: spacing.sm, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.medium },
  on: { backgroundColor: zappy[50] },
  flex: { flex: 1 },
});
