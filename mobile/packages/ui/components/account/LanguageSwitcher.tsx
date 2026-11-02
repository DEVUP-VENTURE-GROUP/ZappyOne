/** Choose the app's language (the website's LanguageSwitcher): one row showing the current language that opens the list, each in its own script. */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, Languages } from 'lucide-react-native';
import { Text } from '../Text';
import { useI18n } from '../../lib/i18n';
import { colors, ink, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

type Lang = { code: string; label: string; native?: string };
const name = (l?: Lang) => (l ? (l.native && l.native !== l.label ? `${l.native} (${l.label})` : l.label) : '');

export function LanguageSwitcher() {
  const { lang, setLang, languages, t } = useI18n();
  const [open, setOpen] = useState(false);
  const list = languages as Lang[];
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={t('sp.language', 'Choose your language')} style={styles.head}>
        <Languages size={17} color={ink[500]} />
        <View style={styles.flex}>
          <Text variant="caption" weight="bold" color={ink[400]}>{t('sp.language', 'Choose your language').toUpperCase()}</Text>
          <Text variant="bodySmall" weight="semibold">{name(list.find((l) => l.code === lang))}</Text>
        </View>
        <Chevron size={17} color={ink[400]} />
      </Pressable>
      {open ? list.map((l) => {
        const on = l.code === lang;
        return (
          <Pressable key={l.code} onPress={() => { setLang(l.code); setOpen(false); }} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.row, on && styles.on]}>
            <Text variant="bodySmall" weight={on ? 'bold' : 'medium'} color={on ? zappy[700] : ink[700]} style={styles.flex}>{name(l)}</Text>
            {on ? <Check size={16} color={zappy[600]} /> : null}
          </Pressable>
        );
      }) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 2, padding: spacing.xs, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.medium },
  on: { backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0 },
});
