/** Optional extras per pet (the website's AddonsStep); a category with none moves straight on. */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { usePetAddonsQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, LoadingState, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Pet } from '../profile/PetProfileSheet';

export function PetAddonsStep({ categoryCode, pets, addonsByPet, onToggle, onContinue }: {
  categoryCode: string; pets: Pet[]; addonsByPet: Record<string, string[]>; onToggle: (petId: string, code: string) => void; onContinue: (opts?: { replace?: boolean }) => void;
}) {
  const t = useT();
  const { data, isLoading } = usePetAddonsQuery({ categoryCode });
  const addons: { code: string; name: string; pricePaise: number }[] = data?.addons || [];
  // Nothing to offer: hand over without leaving this step in the Back trail.
  useEffect(() => { if (!isLoading && data && !addons.length) onContinue({ replace: true }); }, [isLoading, data, addons.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !addons.length) return <LoadingState />;
  return (
    <View style={styles.gap}>
      <Text variant="bodySmall" weight="bold" color={ink[500]}>{t('petBook.extras', 'Add extras (optional)')}</Text>
      {pets.map((p) => (
        <View key={p._id} style={styles.gap}>
          <Text variant="caption" weight="bold" color={ink[400]}>{p.name}</Text>
          {addons.map((a) => {
            const on = (addonsByPet[p._id] || []).includes(a.code);
            return (
              <Pressable key={a.code} onPress={() => onToggle(p._id, a.code)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.row, on && styles.on]}>
                <Text variant="bodySmall" style={styles.flex}>{a.name}</Text>
                <Plus size={11} color={ink[900]} /><Text variant="bodySmall" weight="bold">{formatPaise(a.pricePaise)}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Button label={t('common.continue', 'Continue')} variant="secondary" onPress={() => onContinue()} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: spacing.md, borderRadius: radius.medium, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  on: { borderColor: zappy[500], backgroundColor: zappy[50] },
  flex: { flex: 1 },
});
