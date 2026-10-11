/** Which pets this is for (the website's pets step); a profile missing the safety answers is finished first. */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, PawPrint } from 'lucide-react-native';
import { Button, EmptyState, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Pet } from '../profile/PetProfileSheet';

export function PetPickStep({ pets, selected, onToggle, onContinue }: { pets: Pet[]; selected: string[]; onToggle: (id: string) => void; onContinue: () => void }) {
  const router = useRouter();
  const t = useT();
  return (
    <View style={styles.gap}>
      <Text variant="bodySmall" weight="bold" color={ink[500]}>{t('petBook.which', 'Which pet is this for?')}</Text>
      {!pets.length ? (
        <EmptyState icon={<PawPrint size={28} color={slate[300]} />} title={t('petBook.addFirst', 'Add a pet first.')} actionLabel={t('pets.add', 'Add a pet')} onAction={() => router.push('/pet/my-pets' as never)} />
      ) : pets.map((p) => {
        if (!p.safetyAnsweredAt) {
          return (
            <Pressable key={p._id} onPress={() => router.push(`/pet/my-pets?complete=${p._id}` as never)} accessibilityRole="button" style={[styles.row, styles.unfinished]}>
              <Text variant="bodySmall" weight="bold" style={styles.flex}>{p.name}</Text>
              <Text variant="caption" weight="bold" color={accent[700]}>{t('pets.finishToBook', 'Finish profile to book')}</Text>
            </Pressable>
          );
        }
        const on = selected.includes(p._id);
        return (
          <Pressable key={p._id} onPress={() => onToggle(p._id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.row, on && styles.on]}>
            <View style={[styles.box, on && styles.boxOn]}>{on ? <Check size={14} color="#fff" strokeWidth={3} /> : null}</View>
            <Text variant="bodySmall" weight="bold" style={styles.flex}>{p.name}</Text>
            <Text variant="caption" color={ink[400]} style={styles.cap}>{p.species} · {p.size?.replace('_', ' ')}</Text>
          </Pressable>
        );
      })}
      <Button label={t('common.continue', 'Continue')} variant="secondary" disabled={!selected.length} onPress={onContinue} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  on: { borderColor: zappy[500], backgroundColor: zappy[50] },
  unfinished: { borderStyle: 'dashed', borderColor: accent[500], backgroundColor: accent[50] },
  box: { width: 24, height: 24, borderRadius: radius.small, borderWidth: 2, borderColor: slate[300], alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: zappy[500], backgroundColor: zappy[500] },
  flex: { flex: 1 },
  cap: { textTransform: 'capitalize' },
});
