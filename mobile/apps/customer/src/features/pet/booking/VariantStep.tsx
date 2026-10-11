/** Choose the service (the website's variant step): only those offered for every pet picked, popular ones starred. */
import { Pressable, StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { Button, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { PetVariant } from './petBookingRules';

export function VariantStep({ variants, loaded, species, chosen, onPick, onContinue }: {
  variants: PetVariant[]; loaded: boolean; species: string[]; chosen: string | undefined; onPick: (v: PetVariant) => void; onContinue: () => void;
}) {
  const t = useT();
  const fits = variants.filter((v) => species.every((s) => v.species.includes(s)));
  return (
    <View style={styles.gap}>
      <Text variant="bodySmall" weight="bold" color={ink[500]}>{t('petBook.service', 'Choose the service')}</Text>
      {loaded && !fits.length ? (
        <View style={styles.card}><Text variant="bodySmall" color={ink[700]}>{variants.length ? t('petBook.notForPet', 'This service is not offered for the pet you picked yet. Go back and choose another pet.') : t('petBook.notOpen', 'This service is not open for booking yet. Please check back soon.')}</Text></View>
      ) : null}
      {fits.map((v) => {
        const on = chosen === v.code;
        return (
          <Pressable key={v.code} onPress={() => onPick(v)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.card, styles.row, on && styles.on]}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="bold">{v.name}</Text>
              {v.description ? <Text variant="caption" color={ink[500]}>{v.description}</Text> : null}
            </View>
            {v.isPopular ? <Star size={14} color={accent[500]} fill={accent[500]} /> : null}
          </Pressable>
        );
      })}
      <Button label={t('common.continue', 'Continue')} variant="secondary" disabled={!chosen} onPress={onContinue} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  card: { padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  on: { borderColor: zappy[500], backgroundColor: zappy[50] },
  flex: { flex: 1 },
});
